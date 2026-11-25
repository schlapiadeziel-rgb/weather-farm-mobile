#!/usr/bin/env python3
"""Check permanent workshop guidance in isolated production-browser storage.

Uses actual queue/collect/cancel and backup UI actions. Fixtures explicitly set
journey/expansion/delivery progress; they are not natural player progress.
Run after npm run build and starting preview, optionally passing its URL.
This is browser verification, not Android performance or installation testing.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4180'
NOW = 1793512800000
KEY = 'fieldletter.game.v1'
REAL = {
    'fieldletter.real-farm.v1': '{"version":1,"profile":{"name":"Season QA record"},"tasks":[],"measurements":[]}',
    'fieldletter.location.v1': '{"name":"Season QA location","latitude":30,"longitude":120,"source":"manual"}',
    'fieldletter.clinic-draft.v1': '{"version":1,"fields":{"symptoms":"Keep this real draft"}}',
    'field-notes.diagnosis-cases.v1': '[]',
}
PASSED, ERRORS, FAILED_LOCAL = [], [], []


def fixtures():
    source = r'''
import {initialGame, queueProduction, RECIPES} from './src/lib/game.ts';
const now=%s;
const base=initialGame(now);
base.harvests=base.productsCollected=base.ordersDelivered=1;
base.unlockedPlots=7;
let oldQueued=structuredClone(base);
oldQueued.ordersDelivered=4;
oldQueued=queueProduction(queueProduction(oldQueued,'feed_mill','chicken_feed',now),'feed_mill','chicken_feed',now);
delete oldQueued.productionQueuePeak;
const oldBackup={app:'fieldletter',kind:'game',formatVersion:1,exportedAt:new Date(now).toISOString(),game:oldQueued};
const feed=RECIPES.find(recipe=>recipe.id==='chicken_feed');
console.log(JSON.stringify({base,oldQueued,oldBackup,feed}));
''' % NOW
    return json.loads(subprocess.check_output(
        ['node', '--import', 'tsx', '--input-type=module', '-e', source],
        cwd=ROOT, text=True))


def passed(label):
    PASSED.append(label)
    print('PASS', label, flush=True)


def game(page):
    return page.evaluate('key => JSON.parse(localStorage.getItem(key))', KEY)


def wait_game(page, expression):
    page.wait_for_function('key => { const g=JSON.parse(localStorage.getItem(key)); return %s; }' % expression, arg=KEY)
    return game(page)


def invariant(page, baseline=None):
    if baseline is not None:
        assert game(page) == baseline, 'Navigation or presentation changed saved game'
    assert page.evaluate('keys => Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]))', list(REAL)) == REAL
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Document overflow'


def start(browser, data, size, fixture='base', motion='reduce'):
    ctx = browser.new_context(viewport={'width': size[0], 'height': size[1]}, reduced_motion=motion, accept_downloads=True)
    ctx.route('https://**', lambda route: route.abort())
    page = ctx.new_page()
    page.set_default_timeout(15000)
    page.on('pageerror', lambda error: ERRORS.append(str(error)))
    page.on('response', lambda response: FAILED_LOCAL.append(f'{response.status}: {response.url}') if response.url.startswith(URL) and response.status >= 400 else None)
    page.add_init_script('''(() => {
      const NativeDate=Date;
      window.__seasonNow=Number(sessionStorage.getItem('season-clock')||%s);
      window.Date=class extends NativeDate {
        constructor(...args){super(...(args.length?args:[window.__seasonNow]));}
        static now(){return window.__seasonNow;}
      };
      if(!sessionStorage.getItem('season-fixture-loaded')) {
        for(const [k,v] of Object.entries(%s)) localStorage.setItem(k,v);
        sessionStorage.setItem('season-fixture-loaded','yes');
      }
    })();''' % (NOW, json.dumps({**REAL, KEY: json.dumps(data[fixture], ensure_ascii=False)}, ensure_ascii=False)))
    page.goto(URL)
    page.wait_for_selector('.fsh-level')
    wait_game(page, 'Number.isSafeInteger(g.productionQueuePeak)')
    invariant(page)
    return ctx, page


def menu(page, tab):
    page.get_by_role('button', name='打开农场菜单', exact=True).click()
    page.locator(f'[data-game-menu-nav="{tab}"]').click()
    page.wait_for_function('!document.getElementById("root").inert')


def season(page, step):
    page.wait_for_selector(f'.farm-season[data-season-step="{step}"]')
    invariant(page)


def queue_view(page):
    button = page.locator('.fp-mobile-views button').nth(1)
    if button.is_visible():
        button.click()


def advance(page, now):
    page.evaluate('now => { window.__seasonNow=now; sessionStorage.setItem("season-clock",String(now)); }', now)


def unchanged_rewards(before, after):
    for field in ['coins', 'gems', 'xp', 'harvests', 'productsCollected', 'ordersDelivered', 'achievements']:
        assert after[field] == before[field], f'Unexpected {field} reward'


def check_live_flow(browser, data, size, motion):
    label = f'{size[0]}x{size[1]}/{motion}'
    ctx, page = start(browser, data, size, motion=motion)
    season(page, 'workshop')
    baseline = game(page)
    assert baseline['productionQueuePeak'] == 0
    page.locator('.farm-season .fj-collapse').focus()
    page.locator('.farm-season .fj-collapse').press('Enter')
    page.locator('.farm-season .fj-expand').focus()
    page.locator('.farm-season .fj-expand').press('Enter')
    page.locator('.farm-season .fj-action').click()
    page.wait_for_selector('.farm-production-panel')
    invariant(page, baseline)
    passed(f'{label}: workshop guidance expands, folds and locates the recipe without spending or recording completion')

    make = page.locator('[data-recipe-item="chicken_feed"] .fp-queue-button')
    make.click()
    first = wait_game(page, 'g.machines[0].queue.length===1 && g.productionQueuePeak===1')
    unchanged_rewards(baseline, first)
    make.click()
    chained = wait_game(page, 'g.machines[0].queue.length===2 && g.productionQueuePeak===2')
    unchanged_rewards(baseline, chained)
    for item, quantity in data['feed']['inputs'].items():
        assert chained['inventory'][item] == baseline['inventory'][item] - quantity * 2
    invariant(page)
    menu(page, 'farm')
    season(page, 'delivery')
    invariant(page, chained)
    passed(f'{label}: two real queued jobs consume exactly their ingredients and permanently advance guidance without a reward')

    menu(page, 'production')
    page.wait_for_selector('.farm-production-panel')
    queue_view(page)
    jobs = chained['machines'][0]['queue']
    advance(page, jobs[-1]['readyAt'] + 1)
    page.wait_for_selector('.fp-job[data-production-phase="ready"]')
    for remaining in [1, 0]:
        page.get_by_role('button', name='收取鸡饲料', exact=True).first.click()
        wait_game(page, f'g.machines[0].queue.length==={remaining}')
    collected = game(page)
    assert collected['productionQueuePeak'] == 2
    assert collected['inventory']['chicken_feed'] == chained['inventory']['chicken_feed'] + data['feed']['quantity'] * 2
    assert collected['xp'] == chained['xp'] + data['feed']['xp'] * 2
    for field in ['coins', 'gems', 'harvests', 'productsCollected', 'ordersDelivered', 'achievements']:
        assert collected[field] == chained[field]
    menu(page, 'farm')
    season(page, 'delivery')
    invariant(page, collected)
    page.reload()
    page.wait_for_selector('.fsh-level')
    season(page, 'delivery')
    invariant(page, collected)
    passed(f'{label}: collecting both products and reloading retain the workshop milestone and exact product/XP awards')

    menu(page, 'journal')
    page.get_by_role('region', name='游戏进度备份').wait_for()
    with page.expect_download() as event:
        page.get_by_role('button', name='导出游戏备份', exact=True).click()
    exported = json.loads(Path(event.value.path()).read_text())
    assert exported['game'] == collected
    assert exported['game']['productionQueuePeak'] == 2
    assert not any(sentinel in json.dumps(exported) for sentinel in ['Season QA record', 'Season QA location', 'Keep this real draft'])
    invariant(page, collected)
    upload = {'name': 'season-progress.json', 'mimeType': 'application/json', 'buffer': json.dumps(exported, ensure_ascii=False).encode()}
    page.get_by_label('选择游戏备份文件', exact=True).set_input_files(upload)
    page.get_by_role('heading', name='恢复这份游戏进度？', exact=True).wait_for()
    invariant(page, collected)
    page.get_by_role('button', name='保留当前进度', exact=True).click()
    invariant(page, collected)
    page.get_by_label('选择游戏备份文件', exact=True).set_input_files(upload)
    page.get_by_role('button', name='确认恢复游戏', exact=True).click()
    page.get_by_role('heading', name='恢复这份游戏进度？', exact=True).wait_for(state='detached')
    invariant(page, collected)
    menu(page, 'farm')
    season(page, 'delivery')
    invariant(page, collected)
    passed(f'{label}: export/import retains the permanent milestone; preview/cancel and all backup actions preserve independent real data')
    ctx.close()


def check_old_queue(browser, data, size, motion):
    label = f'{size[0]}x{size[1]}/{motion}'
    ctx, page = start(browser, data, size, 'oldQueued', motion)
    migrated = game(page)
    assert migrated['productionQueuePeak'] == 2
    assert page.locator('.farm-season').count() == 0
    assert {key: value for key, value in migrated.items() if key != 'productionQueuePeak'} == data['oldQueued']
    passed(f'{label}: an old save with two jobs backfills completion without changing its economy or queue')
    menu(page, 'production')
    page.wait_for_selector('.farm-production-panel')
    queue_view(page)
    page.locator('.fp-job-cancel').click()
    page.get_by_role('button', name='保留排队', exact=True).wait_for()
    invariant(page, migrated)
    page.get_by_role('button', name='保留排队', exact=True).click()
    invariant(page, migrated)
    page.locator('.fp-job-cancel').click()
    page.locator('.fp-confirm-yes').click()
    canceled = wait_game(page, 'g.machines[0].queue.length===1 && g.productionQueuePeak===2')
    assert canceled['gems'] == migrated['gems'] - 1
    for item, quantity in data['feed']['inputs'].items():
        assert canceled['inventory'][item] == migrated['inventory'][item] + quantity
    for field in ['coins', 'xp', 'harvests', 'productsCollected', 'ordersDelivered', 'achievements']:
        assert canceled[field] == migrated[field]
    advance(page, canceled['machines'][0]['queue'][0]['readyAt'] + 1)
    page.get_by_role('button', name='收取鸡饲料', exact=True).wait_for()
    page.get_by_role('button', name='收取鸡饲料', exact=True).click()
    completed = wait_game(page, 'g.machines[0].queue.length===0 && g.productionQueuePeak===2')
    menu(page, 'farm')
    page.wait_for_selector('.fsh-level')
    assert page.locator('.farm-season').count() == 0
    invariant(page, completed)
    page.reload()
    page.wait_for_selector('.fsh-level')
    assert page.locator('.farm-season').count() == 0
    invariant(page, completed)
    passed(f'{label}: cancel preview is inert; a paid cancellation, collection and reload never reopen completed mid-game guidance')
    ctx.close()


def check_old_backup(browser, data):
    ctx, page = start(browser, data, (844, 390))
    baseline = game(page)
    menu(page, 'journal')
    page.get_by_label('选择游戏备份文件', exact=True).set_input_files({
        'name': 'old-season-progress.json', 'mimeType': 'application/json',
        'buffer': json.dumps(data['oldBackup'], ensure_ascii=False).encode()})
    page.get_by_role('heading', name='恢复这份游戏进度？', exact=True).wait_for()
    invariant(page, baseline)
    page.get_by_role('button', name='确认恢复游戏', exact=True).click()
    imported = wait_game(page, 'g.ordersDelivered===4 && g.productionQueuePeak===2')
    invariant(page)
    assert {key: value for key, value in imported.items() if key != 'productionQueuePeak'} == data['oldQueued']
    menu(page, 'farm')
    page.wait_for_selector('.fsh-level')
    assert page.locator('.farm-season').count() == 0
    invariant(page, imported)
    passed('old format-1 backup without a peak field imports through the real confirmation UI and backfills completion')
    ctx.close()


if __name__ == '__main__':
    data = fixtures()
    with sync_playwright() as api:
        browser = api.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
        for size, motion in [((640, 360), 'reduce'), ((844, 390), 'reduce'), ((1280, 720), 'reduce'), ((844, 390), 'no-preference')]:
            check_live_flow(browser, data, size, motion)
            check_old_queue(browser, data, size, motion)
        check_old_backup(browser, data)
        browser.close()
    assert not ERRORS, ERRORS
    assert not FAILED_LOCAL, FAILED_LOCAL
    print(json.dumps({'passed_groups': len(PASSED), 'page_errors': ERRORS, 'failed_local_requests': FAILED_LOCAL,
                      'scope': 'isolated browser storage and real game UI actions; no Android performance or installation measurements'}, ensure_ascii=False))
