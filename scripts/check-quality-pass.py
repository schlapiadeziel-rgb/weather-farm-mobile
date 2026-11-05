#!/usr/bin/env python3
"""Check v0.31 journey and warehouse flows with isolated, explicit game fixtures.

Run against a production preview; Python Playwright and Chromium are required.
This checks browser behavior and layout, not Android installation, FPS or power.
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
    'fieldletter.real-farm.v1': '{"version":1,"profile":{"name":"Quality QA record"},"tasks":[],"measurements":[]}',
    'fieldletter.location.v1': '{"name":"Quality QA location","latitude":30,"longitude":120,"source":"manual"}',
    'fieldletter.clinic-draft.v1': '{"version":1,"fields":{"symptoms":"Keep this real draft"}}',
    'field-notes.diagnosis-cases.v1': '[]',
}
SOURCE = r'''
import {initialGame,restoreGame,storageUsed} from './src/lib/game.ts';
import {getItem} from './src/lib/farmContent.ts';
const now=%s;
const fresh=initialGame(now);
fresh.inventory.wheat=0;fresh.inventory.egg=0;
fresh.orders=[{id:'quality-first-order',kind:'truck',requirements:{wheat:2,egg:1},coins:20,xp:8}];
const stored=initialGame(now);
stored.harvests=stored.productsCollected=stored.ordersDelivered=1;
stored.xp=1000;
stored.inventory={wheat:12,corn:5,carrot:3,egg:2,chicken_feed:1,saw:1};
const full=structuredClone(fresh);full.inventory={wheat:100};
const waiting=structuredClone(fresh);
waiting.plots[0]={...waiting.plots[0],growth:0,plantedAt:now,readyAt:now+120000};
const season=initialGame(now);
season.harvests=season.productsCollected=season.ordersDelivered=1;
const seasonFull=structuredClone(season);
seasonFull.coins=0;
for (const id of ['nail','wood_panel','screw','plank','bolt','duct_tape']) seasonFull.inventory[id]=0;
seasonFull.barnCapacity=storageUsed(seasonFull,'barn');
const seasoned=structuredClone(season);
seasoned.unlockedPlots=7;
seasoned.ordersDelivered=4;
seasoned.xp=80;
seasoned.machines=[...seasoned.machines,{id:'dairy',slots:2,queue:[]}];
console.log(JSON.stringify({fresh:restoreGame(fresh,now),stored:restoreGame(stored,now),full:restoreGame(full,now),waiting:restoreGame(waiting,now),season:restoreGame(season,now),seasonFull:restoreGame(seasonFull,now),seasoned:restoreGame(seasoned,now),wheatPrice:getItem('wheat').price,eggPrice:getItem('egg').price}));
''' % NOW
DATA = json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',SOURCE],cwd=ROOT,text=True))
PASSED, ERRORS, FAILED_LOCAL = [], [], []


def passed(label):
    PASSED.append(label)
    print('PASS',label,flush=True)


def read_game(page):
    return page.evaluate('key => JSON.parse(localStorage.getItem(key))',KEY)


def invariant(page, baseline=None):
    if baseline is not None:
        assert read_game(page)==baseline,'Navigation or presentation changed saved game'
    assert page.evaluate('keys => Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]))',list(REAL))==REAL
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),'Document overflow'


def start(browser,size,fixture='fresh',motion='reduce'):
    ctx=browser.new_context(viewport={'width':size[0],'height':size[1]},reduced_motion=motion)
    ctx.route('https://**',lambda route:route.abort())
    page=ctx.new_page();page.set_default_timeout(15000)
    page.on('pageerror',lambda error:ERRORS.append(str(error)))
    page.on('response',lambda response:FAILED_LOCAL.append(f'{response.status}: {response.url}') if response.url.startswith(URL) and response.status>=400 else None)
    page.add_init_script('''(() => {
      const NativeDate=Date;
      window.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[%s]));} static now(){return %s;}};
      if(!sessionStorage.getItem('quality-fixture-loaded')) {
        for(const [k,v] of Object.entries(%s)) localStorage.setItem(k,v);
        sessionStorage.setItem('quality-fixture-loaded','yes');
      }
    })();''' % (NOW,NOW,json.dumps({**REAL,KEY:json.dumps(DATA[fixture],ensure_ascii=False)},ensure_ascii=False)))
    page.goto(URL);page.wait_for_selector('.fsh-level')
    return ctx,page


def menu(page,tab):
    page.get_by_role('button',name='打开农场菜单',exact=True).click()
    page.locator(f'[data-game-menu-nav="{tab}"]').click()
    page.wait_for_function('!document.getElementById("root").inert')


def journey(page,step):
    page.wait_for_selector(f'.farm-journey[data-journey-step="{step}"]')
    invariant(page)
    return page.locator('.farm-journey')


def activate(locator,keyboard=False):
    if keyboard:
        locator.focus();locator.press('Enter')
    else:
        locator.click()


def close_details(page):
    if page.locator('.panel-close').count():
        page.locator('.panel-close').click()


def check_geometry(page):
    overlaps=page.locator('.farm-journey').evaluate('''card => {
      const r=card.getBoundingClientRect();
      return [...document.querySelectorAll('.fsh-menu,.fsh-assistant,.advance-button,[data-plot-id],[data-pen-id]')]
        .filter(el=>el.getClientRects().length).filter(el=>{const b=el.getBoundingClientRect();return Math.min(r.right,b.right)-Math.max(r.left,b.left)>1 && Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top)>1;})
        .map(el=>el.getAttribute('aria-label')||el.className);
    }''')
    assert not overlaps, f'Journey covers existing interactive targets: {overlaps}'
    for button in page.locator('.farm-journey button').all():
        box=button.bounding_box();assert box and box['width']>=44 and box['height']>=44


def check_journey(browser,size,motion='reduce'):
    label=f'{size[0]}x{size[1]}/{motion}'
    ctx,page=start(browser,size,motion=motion)
    baseline=read_game(page)
    journey(page,'harvest');check_geometry(page)
    assert page.locator('.farm-journey').get_attribute('data-journey-completed')=='0'
    activate(page.locator('.fj-collapse'),True)
    assert page.locator('.farm-journey').get_attribute('data-journey-collapsed')=='true'
    activate(page.locator('.fj-expand'),True)
    invariant(page,baseline)
    if size==(844,390) and motion=='reduce':page.screenshot(path=str(ROOT/'docs/quality-journey.png'))
    passed(f'{label}: first-run guidance is visible, usable by keyboard, can fold, does not cover farm controls or change data')

    activate(page.locator('.fj-action'),True)
    page.wait_for_selector('[data-plot-id="1"].selected')
    page.wait_for_selector('.plot-panel')
    assert page.locator('.farm-journey').count()==0
    invariant(page,baseline)
    passed(f'{label}: harvest guidance only locates mature field and opens details, without harvesting')
    page.get_by_role('button',name='收获 · 小麦 ×2',exact=True).click()
    page.wait_for_function('k=>JSON.parse(localStorage.getItem(k)).harvests===1',arg=KEY)
    harvested=read_game(page)
    assert harvested['inventory']['wheat']==baseline['inventory']['wheat']+2
    assert harvested['coins']==baseline['coins']
    close_details(page)
    journey(page,'animal')
    assert page.locator('.farm-journey').get_attribute('data-journey-completed')=='1'
    invariant(page,harvested)
    passed(f'{label}: a real harvest advances milestone once and preserves real records')

    activate(page.locator('.fj-action'))
    page.wait_for_selector('[data-pen-id="1"].selected')
    page.wait_for_selector('.plot-panel')
    invariant(page,harvested)
    page.get_by_role('button',name='收集鸡蛋 ×1',exact=True).click()
    page.wait_for_function('k=>JSON.parse(localStorage.getItem(k)).productsCollected===1',arg=KEY)
    collected=read_game(page)
    assert collected['inventory']['egg']==harvested['inventory'].get('egg',0)+1
    assert collected['coins']==harvested['coins']
    close_details(page)
    journey(page,'order');check_geometry(page)
    assert page.locator('.farm-journey').get_attribute('data-journey-completed')=='2'
    invariant(page,collected)
    passed(f'{label}: a real animal collection advances milestone once, and pasture guidance respects normal action rules')

    activate(page.locator('.fj-action'))
    try:
        page.wait_for_selector('[data-order-id="quality-first-order"]')
    except Exception:
        print('ORDER_NAV_DIAGNOSTIC',json.dumps({'text':page.locator('body').inner_text(),'saved':read_game(page)},ensure_ascii=False),flush=True)
        page.screenshot(path='/workspace/scratch/quality-order-navigation-failure.png')
        raise
    invariant(page,collected)
    page.locator('[data-order-id="quality-first-order"]').get_by_role('button',name='装好，出发！',exact=True).click()
    page.wait_for_function('k=>JSON.parse(localStorage.getItem(k)).ordersDelivered===1',arg=KEY)
    delivered=read_game(page)
    assert delivered['coins']==collected['coins']+20
    assert delivered['inventory']['wheat']==collected['inventory']['wheat']-2
    assert delivered['inventory']['egg']==collected['inventory']['egg']-1
    menu(page,'farm')
    assert page.locator('.farm-journey').count()==0
    invariant(page,delivered)
    page.reload();page.wait_for_selector('.fsh-level')
    assert page.locator('.farm-journey').count()==0
    invariant(page,delivered)
    passed(f'{label}: actual delivery completes journey; reopening keeps saved progress and grants no extra reward')
    ctx.close()


def inventory_ids(page):
    return page.locator('[data-inventory-item]').evaluate_all('els=>els.map(el=>el.dataset.inventoryItem)')


def check_storage(browser,size):
    label=f'{size[0]}x{size[1]}'
    ctx,page=start(browser,size,'stored')
    baseline=read_game(page)
    assert page.locator('.farm-journey').count()==0
    menu(page,'storage');page.wait_for_selector('.fe-storage')
    search=page.get_by_role('searchbox',name='查找库存物品')
    search.fill('　小麦　')
    assert inventory_ids(page)==['wheat']
    assert '1' in page.locator('.fe-inventory-results').inner_text()
    invariant(page,baseline)
    passed(f'{label}: existing players have no novice card; inventory name search handles surrounding Unicode whitespace without changing stock')

    search.fill('完全不存在')
    assert inventory_ids(page)==[]
    assert page.locator('.fe-inventory-no-results').is_visible()
    activate(page.get_by_role('button',name='清除搜索',exact=True),True)
    assert search.input_value()==''
    assert search.evaluate('el=>el===document.activeElement')
    page.get_by_role('combobox',name='库存排序').select_option('quantity')
    ids=inventory_ids(page)
    assert [baseline['inventory'][i] for i in ids]==sorted([baseline['inventory'][i] for i in ids],reverse=True)
    page.locator('.fe-filter').get_by_role('button',name='谷仓',exact=True).click()
    assert set(inventory_ids(page))=={'egg','chicken_feed','saw'}
    page.locator('.fe-filter').get_by_role('button',name='筒仓',exact=True).click()
    assert set(inventory_ids(page))=={'wheat','corn','carrot'}
    page.locator('.fe-filter').get_by_role('button',name='全部',exact=True).click()
    invariant(page,baseline)
    if size==(1280,720):page.screenshot(path=str(ROOT/'docs/quality-storage.png'))
    passed(f'{label}: empty search clears with restored keyboard focus; quantity ordering and silo/barn filters agree with actual stock')

    # Change an existing form first; quick listing must reset stale quantity/price.
    page.locator('.fe-tabs').get_by_role('button',name='路边摊',exact=False).click()
    page.get_by_role('spinbutton',name='数量',exact=True).fill('2')
    page.get_by_role('spinbutton',name='每份金币',exact=True).fill('2')
    page.get_by_role('button',name='我的库存',exact=True).click()
    activate(page.get_by_role('button',name='将小麦带到路边摊',exact=True),True)
    select=page.locator('.fe-sale-form select')
    assert select.input_value()=='wheat'
    assert page.get_by_role('spinbutton',name='数量',exact=True).input_value()=='1'
    assert page.get_by_role('spinbutton',name='每份金币',exact=True).input_value()==str(DATA['wheatPrice'])
    assert select.evaluate('el=>el===document.activeElement')
    assert '当前库存' in page.locator('.fe-sale-preview').inner_text()
    invariant(page,baseline)
    passed(f'{label}: quick listing preselects exact item, resets quantity and price, and focuses form without consuming stock')

    page.get_by_role('button',name='摆上摊位',exact=True).click()
    page.wait_for_function('k=>JSON.parse(localStorage.getItem(k)).shopListings.length===1',arg=KEY)
    listed=read_game(page)
    assert listed['inventory']['wheat']==baseline['inventory']['wheat']-1
    assert all(listed[k]==baseline[k] for k in ['coins','gems','xp','harvests','productsCollected','ordersDelivered'])
    assert listed['shopListings'][0]['item']=='wheat' and listed['shopListings'][0]['quantity']==1
    page.get_by_role('button',name='我的库存',exact=True).click()
    activate(page.get_by_role('button',name='将鸡蛋带到路边摊',exact=True))
    assert select.input_value()=='egg'
    assert page.get_by_role('spinbutton',name='每份金币',exact=True).input_value()==str(DATA['eggPrice'])
    invariant(page,listed)
    page.reload();page.wait_for_selector('.fsh-level')
    invariant(page,listed)
    menu(page,'storage');page.wait_for_selector('.fe-storage')
    assert '11' in page.locator('[data-inventory-item="wheat"]').inner_text()
    passed(f'{label}: final listing consumes exactly one item once; another preview and reload preserve inventory, sale and real data')
    ctx.close()


def season_card(page, step):
    page.wait_for_selector(f'.farm-season[data-season-step="{step}"]')
    invariant(page)
    return page.locator('.farm-season')


def check_season_geometry(page):
    overlaps = page.locator('.farm-season').evaluate('''card => {
      const r=card.getBoundingClientRect();
      return [...document.querySelectorAll('.fsh-menu,.fsh-assistant,.advance-button,[data-plot-id],[data-pen-id]')]
        .filter(el=>el.getClientRects().length).filter(el=>{const b=el.getBoundingClientRect();return Math.min(r.right,b.right)-Math.max(r.left,b.left)>1 && Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top)>1;})
        .map(el=>el.getAttribute('aria-label')||el.className);
    }''')
    assert not overlaps, f'Season card covers existing interactive targets: {overlaps}'
    for button in page.locator('.farm-season button').all():
        box = button.bounding_box()
        assert box and box['width'] >= 44 and box['height'] >= 44, box


def assert_box(locator):
    box = locator.bounding_box()
    assert box and box['width'] >= 43.5 and box['height'] >= 43.5, box


def check_season(browser, size, motion='reduce'):
    label = f'{size[0]}x{size[1]}/{motion}'
    ctx, page = start(browser, size, 'season', motion)
    baseline = read_game(page)
    assert page.locator('.farm-journey').count() == 0
    season_card(page, 'expand')
    check_season_geometry(page)
    assert page.locator('.farm-season').get_attribute('data-season-target') == 'storage'
    assert page.locator('.farm-season').get_attribute('data-season-section') == 'upgrade'
    activate(page.locator('.farm-season .fj-collapse'), True)
    assert page.locator('.farm-season').get_attribute('data-season-collapsed') == 'true'
    activate(page.locator('.farm-season .fj-expand'), True)
    invariant(page, baseline)
    if size == (844, 390) and motion == 'reduce':
        page.screenshot(path=str(ROOT / 'docs/quality-season.png'))
    activate(page.locator('.farm-season .fj-action'), True)
    page.wait_for_selector('.fe-upgrade-grid')
    invariant(page, baseline)
    for button in page.locator('.fe-tabs button, .fe-upgrade-grid .fe-button').all():
        assert_box(button)
    passed(f'{label}: mid-game card opens storage upgrade without spending; upgrade actions stay at 44px')
    ctx.close()


def check_season_edges(browser):
    ctx, page = start(browser, (640, 360), 'seasonFull')
    before = read_game(page)
    season_card(page, 'expand')
    assert any(word in page.locator('.farm-season').inner_text() for word in ['材料', '空位'])
    activate(page.locator('.farm-season .fj-action'))
    page.wait_for_selector('.fe-inventory-section')
    invariant(page, before)
    for button in page.locator('.fe-filter button, .fe-inventory-sell').all():
        assert_box(button)
    passed('full barn: mid-game guide leads to inventory without spending; filters and listing buttons stay at 44px')
    ctx.close()

    ctx, page = start(browser, (844, 390), 'season')
    page.locator('[data-plot-id="2"]').click()
    page.wait_for_selector('.plot-panel')
    assert page.locator('.farm-season').count() == 0
    assert page.locator('.farm-journey').count() == 0
    assert_box(page.locator('.panel-close'))
    assert_box(page.locator('.plot-panel .primary-action'))
    assert_box(page.locator('.seed-cycle-note button'))
    assert page.locator('.panel-close').get_attribute('aria-label')
    assert page.locator('.plot-panel .primary-action').get_attribute('aria-describedby') == 'field-action-note'
    page.locator('.panel-close').click()
    page.wait_for_selector('.farm-season')
    passed('field details hide the season card; close, harvest action and warehouse link stay at 44px')
    menu(page, 'livestock')
    page.wait_for_selector('.farm-season')
    page.locator('[data-pen-id="2"]').click()
    page.wait_for_selector('.plot-panel')
    assert page.locator('.farm-season').count() == 0
    assert_box(page.locator('.panel-close'))
    assert_box(page.locator('.plot-panel .primary-action'))
    assert page.locator('.plot-panel .primary-action').get_attribute('aria-describedby') == 'pasture-action-note'
    page.locator('.panel-close').click()
    menu(page, 'orders')
    page.wait_for_selector('.fe-order-actions')
    assert_box(page.locator('.fe-icon-button').first)
    assert_box(page.locator('.fe-order-actions .fe-button').first)
    passed('pasture details hide the season card; pasture action and order buttons stay at 44px')
    ctx.close()

    ctx, page = start(browser, (1280, 720), 'seasoned')
    page.wait_for_selector('.fsh-level')
    assert page.locator('.farm-season').count() == 0
    assert page.locator('.farm-journey').count() == 0
    passed('finished mid-game milestones hide the season card')
    ctx.close()

    ctx, page = start(browser, (844, 390), 'season', 'no-preference')
    season_card(page, 'expand')
    check_season_geometry(page)
    passed('844x390/no-preference: season card stays visible when motion is allowed')
    ctx.close()


def check_edges(browser):
    ctx,page=start(browser,(640,360),'full')
    before=read_game(page);journey(page,'harvest')
    assert any(word in page.locator('.farm-journey').inner_text() for word in ['空间','仓'])
    activate(page.locator('.fj-action'));page.wait_for_selector('.fe-storage')
    invariant(page,before)
    passed('full silo: first-harvest guide leads to storage without bypassing capacity or consuming anything')
    ctx.close()
    ctx,page=start(browser,(640,360),'waiting')
    before=read_game(page);journey(page,'harvest')
    activate(page.locator('.fj-action'));page.wait_for_selector('.plot-panel')
    invariant(page,before)
    assert not page.get_by_role('button',name='收获 · 小麦 ×2',exact=True).count()
    passed('waiting crops: guidance opens real growing state and never pretends the crop is mature or spends gems')
    ctx.close()


if __name__=='__main__':
    with sync_playwright() as api:
        browser=api.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
        for size in [(640,360),(844,390),(1280,720)]:
            check_journey(browser,size)
            check_storage(browser,size)
            check_season(browser,size)
        check_journey(browser,(844,390),'no-preference')
        check_edges(browser)
        check_season_edges(browser)
        browser.close()
    assert not ERRORS,ERRORS
    assert not FAILED_LOCAL,FAILED_LOCAL
    print(json.dumps({'passed_groups':len(PASSED),'page_errors':ERRORS,'failed_local_requests':FAILED_LOCAL},ensure_ascii=False))
