#!/usr/bin/env python3
"""Check town shortage/source/return navigation against the production build.

Uses isolated validated level-32 test saves, never a real player's progression.
Requires existing Python Playwright + Chromium, with no project dependency change.
After npm run build and npm run preview:
  python scripts/check-town-supply-return.py [http://127.0.0.1:4173]
"""
import json
import os
from pathlib import Path
import subprocess
import sys

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4173'
NOW = 1793512800000
GAME_KEY = 'fieldletter.game.v1'
REAL = {
    'fieldletter.real-farm.v1': {'version': 1, 'profile': {'name': 'QA independent record', 'production': 'wheat', 'stage': 'seedling', 'notes': 'preserve'}, 'tasks': [], 'measurements': []},
    'fieldletter.location.v1': {'name': 'QA manual location', 'latitude': 30, 'longitude': 120, 'source': 'manual'},
    'fieldletter.clinic-draft.v1': {'version': 1, 'updatedAt': '2026-11-01T06:00:00.000Z', 'fields': {'category': 'crop', 'subject': 'QA observation', 'symptoms': 'preserve draft', 'onset': '', 'extent': '', 'affected': '', 'total': '', 'stage': '', 'management': ''}, 'speechReviewed': False, 'measurementIds': [], 'hadMedia': False},
    'field-notes.diagnosis-cases.v1': [],
}
REAL_RAW = {key: json.dumps(value, ensure_ascii=False) for key, value in REAL.items()}
FIXTURE_SOURCE = r'''
import { initialGame, restoreGame } from './src/lib/game.ts';
import { townVisitorReward } from './src/lib/townState.ts';
const now=%s, game=initialGame(now);
game.xp=20*31**2;
game.plots=game.plots.map(p => ({ id:p.id,crop:null,growth:0,health:100,moisture:50 }));
game.animals=[{id:1,animal:'chicken',health:100,feed:0,progress:0},{id:2,animal:'cow',health:100,feed:0,progress:0},{id:3,animal:null,health:100,feed:0,progress:0}];
game.orders=[];
for (const id of ['wheat','milk','honey','cream_cake','cream','white_sugar']) delete game.inventory[id];
for (const id of ['dairy','sugar_mill','cake_oven']) game.machines.push({id,slots:2,queue:[]});
const guest=(id,name,buildingId,item) => ({id,name,buildingId,requirements:{[item]:1},...townVisitorReward({[item]:1}),arrivedAt:now-300000});
game.town={version:1,reputation:8,trainSerial:2,nextTrainAt:now+300000,
 buildings:[{id:'store',level:1},{id:'cafe',level:1},{id:'inn',level:1}],
 visitors:[guest('town-1-0','小满','cafe','wheat'),guest('town-1-1','林叔','inn','milk'),guest('town-1-2','阿禾','cafe','honey'),guest('town-2-0','青松','inn','cream_cake')]};
console.log(JSON.stringify(restoreGame(game,now)));
''' % NOW
FIXTURE = json.loads(subprocess.check_output(['node', '--import', 'tsx', '--input-type=module', '-e', FIXTURE_SOURCE], cwd=ROOT, text=True))
PASSED = []
ERRORS = []


def passed(name):
    PASSED.append(name)
    print('PASS', name, flush=True)


def game(page):
    return page.evaluate('key => JSON.parse(localStorage.getItem(key))', GAME_KEY)


def economy(page):
    current = game(page)
    return {key: current[key] for key in ['coins', 'gems', 'xp', 'inventory', 'town', 'machines', 'layout']}


def unchanged(page, expected):
    assert economy(page) == expected
    assert page.evaluate('keys => Object.fromEntries(keys.map(key => [key,localStorage.getItem(key)]))', list(REAL_RAW)) == REAL_RAW
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')


def context(browser, width, height, motion='reduce'):
    ctx = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion=motion)
    ctx.route('https://**', lambda route: route.abort())
    page = ctx.new_page()
    page.on('pageerror', lambda error: ERRORS.append(str(error)))
    storage = {**REAL_RAW, GAME_KEY: json.dumps(FIXTURE, ensure_ascii=False)}
    page.add_init_script('''(() => {
      const NativeDate=Date;
      window.__qaNow=%s;
      window.Date=class extends NativeDate {
        constructor(...args) {super(...(args.length?args:[window.__qaNow]));}
        static now() {return window.__qaNow;}
      };
      const storage=%s;
      for (const [key,value] of Object.entries(storage)) localStorage.setItem(key,value);
    })();''' % (NOW, json.dumps(storage, ensure_ascii=False)))
    page.goto(URL)
    page.wait_for_selector('.fsh-level')
    return ctx, page


def menu_town(page):
    page.get_by_role('button', name='打开农场菜单', exact=True).click()
    page.locator('[data-game-menu-nav="town"]').click()
    page.wait_for_selector('[data-town-selected]')


def choose_guest(page, building, visitor):
    page.locator(f'[data-town-building="{building}"]').click()
    page.locator(f'[data-town-visitor="{visitor}"]').wait_for(state='visible')


def shortage(page, visitor, item, keyboard=False):
    button = page.locator(f'[data-town-visitor="{visitor}"] .ft-missing-items > div').filter(has_text=f'还缺{item}').get_by_role('button')
    if keyboard:
        button.focus()
        button.press('Enter')
    else:
        button.click()


def exact_guest(page, building, visitor):
    page.wait_for_selector(f'[data-town-selected="{building}"]')
    page.wait_for_function('id => document.activeElement?.dataset.townVisitor === id', arg=visitor)
    assert not page.evaluate('document.getElementById("root").inert')


def return_guest(page, building, visitor, keyboard=False):
    # The town-origin control is separate from nested recipe breadcrumbs.
    button = page.locator('[data-supply-return="town"] .supply-return-main')
    if keyboard:
        button.focus()
        button.press('Enter')
    else:
        button.click()
    exact_guest(page, building, visitor)


def ingredient(page, recipe, item):
    page.locator(f'[data-recipe-item="{recipe}"]').get_by_role('button', name=f'补充{item}，', exact=False).click()


def recipe_return(page, item):
    page.get_by_role('button', name=f'返回{item}配方', exact=True).click()


def focused_recipe(page, recipe):
    page.wait_for_selector(f'[data-recipe-item="{recipe}"].is-focused')


def check_viewport(browser, width, height):
    label = f'{width}x{height}'
    ctx, page = context(browser, width, height)
    baseline = economy(page)
    menu_town(page)
    choose_guest(page, 'cafe', 'town-1-0')
    shortage(page, 'town-1-0', '小麦', keyboard=True)
    page.wait_for_selector('.farm-scene')
    assert page.locator('.primary-action').filter(has_text='播种小麦').count() == 1
    if width == 844:
        page.screenshot(path=str(ROOT / 'docs/town-supply-return.png'))
    return_guest(page, 'cafe', 'town-1-0', keyboard=True)
    unchanged(page, baseline)
    passed(f'{label}: cafe crop source and keyboard return to exact guest without state changes')

    choose_guest(page, 'inn', 'town-1-1')
    shortage(page, 'town-1-1', '牛奶')
    page.wait_for_selector('[data-pen-id="2"].selected')
    return_guest(page, 'inn', 'town-1-1')
    unchanged(page, baseline)
    passed(f'{label}: inn animal source selects cow pen and returns to exact guest')

    choose_guest(page, 'cafe', 'town-1-2')
    honey_button = page.locator('[data-town-visitor="town-1-2"] .ft-missing-items button')
    assert '蜂箱' in honey_button.inner_text()
    shortage(page, 'town-1-2', '蜂蜜')
    page.wait_for_selector('.fe-honey-card')
    assert page.get_by_role('button', name='蜂箱', exact=True).get_attribute('aria-pressed') == 'true'
    return_guest(page, 'cafe', 'town-1-2')
    unchanged(page, baseline)
    passed(f'{label}: honey source label and route use hive, not livestock')

    choose_guest(page, 'inn', 'town-2-0')
    shortage(page, 'town-2-0', '奶油蛋糕')
    focused_recipe(page, 'cream_cake')
    ingredient(page, 'cream_cake', '奶油')
    focused_recipe(page, 'cream')
    ingredient(page, 'cream', '牛奶')
    page.wait_for_selector('[data-pen-id="2"].selected')
    recipe_return(page, '奶油')
    focused_recipe(page, 'cream')
    recipe_return(page, '奶油蛋糕')
    focused_recipe(page, 'cream_cake')
    return_guest(page, 'inn', 'town-2-0')
    unchanged(page, baseline)
    passed(f'{label}: product -> ingredient recipe -> animal -> nested recipe returns -> exact origin guest')

    choose_guest(page, 'cafe', 'town-1-0')
    shortage(page, 'town-1-0', '小麦')
    page.wait_for_selector('.farm-scene')
    menu_town(page)
    assert page.locator('.supply-return').count() == 0
    choose_guest(page, 'inn', 'town-1-1')
    shortage(page, 'town-1-1', '牛奶')
    page.wait_for_selector('[data-pen-id="2"].selected')
    return_guest(page, 'inn', 'town-1-1')
    unchanged(page, baseline)
    passed(f'{label}: new shortage origin replaces prior cafe origin with inn guest')

    choose_guest(page, 'inn', 'town-2-0')
    shortage(page, 'town-2-0', '奶油蛋糕')
    focused_recipe(page, 'cream_cake')
    ingredient(page, 'cream_cake', '奶油')
    focused_recipe(page, 'cream')
    page.locator('.supply-return-close').click()
    assert page.locator('[data-supply-return="town"] .supply-return-main').count() == 0
    assert page.locator('.supply-return-main').count() == 0
    focused_recipe(page, 'cream')
    unchanged(page, baseline)
    passed(f'{label}: explicit end clears town origin and nested recipe breadcrumbs without navigating')

    menu_town(page)
    choose_guest(page, 'cafe', 'town-1-0')
    shortage(page, 'town-1-0', '小麦')
    page.wait_for_selector('.farm-scene')
    page.get_by_role('button', name='进入农场助手', exact=True).click()
    page.wait_for_selector('.assistant-shell')
    assert page.locator('[data-supply-return="town"] .supply-return-main').count() == 0
    page.get_by_role('button', name='返回农场游戏', exact=True).click()
    page.wait_for_selector('.farm-scene')
    assert page.locator('[data-supply-return="town"] .supply-return-main').count() == 0
    assert page.locator('.supply-return-main').count() == 0
    unchanged(page, baseline)
    passed(f'{label}: assistant switch and return clear temporary context and preserve four real-data keys')
    ctx.close()


if __name__ == '__main__':
    with sync_playwright() as api:
        browser = api.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
        for size in [(640, 360), (844, 390), (1280, 720)]:
            check_viewport(browser, *size)
        ctx, page = context(browser, 844, 390, motion='no-preference')
        baseline = economy(page)
        menu_town(page)
        choose_guest(page, 'cafe', 'town-1-0')
        shortage(page, 'town-1-0', '小麦')
        page.wait_for_selector('.farm-scene')
        return_guest(page, 'cafe', 'town-1-0')
        unchanged(page, baseline)
        passed('844x390: animated lazy page navigation preserves exact guest return and read-only state')
        ctx.close()
        browser.close()
    assert not ERRORS, ERRORS
    print(json.dumps({'passed_groups': len(PASSED), 'page_errors': ERRORS}, ensure_ascii=False))
