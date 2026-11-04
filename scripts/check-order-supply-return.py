#!/usr/bin/env python3
"""Exercise order -> source -> recipe -> original order with isolated real saves.

Run against npm run build + npm run preview. Requires existing Python Playwright
and Chromium. This checks browser interaction, not Android frame rate or installs.
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
REAL_RAW = {
    'fieldletter.real-farm.v1': '{"version":1,"profile":{"name":"Order QA record"},"tasks":[],"measurements":[]}',
    'fieldletter.location.v1': '{"name":"Order QA location","latitude":30,"longitude":120,"source":"manual"}',
    'fieldletter.clinic-draft.v1': '{"version":1,"fields":{"symptoms":"Preserve this draft"}}',
    'field-notes.diagnosis-cases.v1': '[]',
}
SOURCE = r'''
import { initialGame, restoreGame } from './src/lib/game.ts';
const now=%s, game=initialGame(now);
game.xp=20*31**2;
game.plots=game.plots.map((p,i) => i===0?p:({id:p.id,crop:null,growth:0,health:100,moisture:50}));
game.animals=[{id:1,animal:'chicken',health:100,feed:0,progress:0},{id:2,animal:'cow',health:100,feed:0,progress:0},{id:3,animal:null,health:100,feed:0,progress:0}];
for (const id of ['wheat','milk','cream_cake','cream','white_sugar']) delete game.inventory[id];
for (const id of ['dairy','sugar_mill','cake_oven']) game.machines.push({id,slots:2,queue:[]});
game.orders=[
 {id:'qa-truck-1',kind:'truck',requirements:{wheat:3},coins:10,xp:8},
 {id:'qa-truck-2',kind:'truck',requirements:{milk:2},coins:25,xp:8},
 {id:'qa-boat-1',kind:'boat',requirements:{wheat:1},coins:10,xp:24},
 {id:'qa-boat-2',kind:'boat',requirements:{cream_cake:1},coins:100,xp:24},
];
console.log(JSON.stringify(restoreGame(game,now)));
''' % NOW
FIXTURE = json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',SOURCE], cwd=ROOT, text=True))
PASSED, ERRORS = [], []


def passed(name):
    PASSED.append(name)
    print('PASS', name, flush=True)


def game(page):
    return page.evaluate('key => JSON.parse(localStorage.getItem(key))', GAME_KEY)


def preserved(page, baseline):
    assert game(page) == baseline, 'Read-only navigation changed game save'
    assert page.evaluate('keys => Object.fromEntries(keys.map(k => [k,localStorage.getItem(k)]))', list(REAL_RAW)) == REAL_RAW
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal document overflow'


def context(browser, width, height, motion='reduce'):
    ctx=browser.new_context(viewport={'width':width,'height':height},reduced_motion=motion)
    ctx.route('https://**', lambda route: route.abort())
    page=ctx.new_page()
    page.set_default_timeout(15000)
    page.on('pageerror',lambda err: ERRORS.append(str(err)))
    storage={**REAL_RAW,GAME_KEY:json.dumps(FIXTURE,ensure_ascii=False)}
    page.add_init_script('''(() => {
      const NativeDate=Date;
      window.Date=class extends NativeDate {
        constructor(...args) {super(...(args.length?args:[%s]));}
        static now() {return %s;}
      };
      for (const [k,v] of Object.entries(%s)) localStorage.setItem(k,v);
    })();''' % (NOW,NOW,json.dumps(storage,ensure_ascii=False)))
    page.goto(URL)
    page.wait_for_selector('.fsh-level')
    return ctx,page


def menu(page, destination):
    page.get_by_role('button',name='打开农场菜单',exact=True).click()
    page.locator(f'[data-game-menu-nav="{destination}"]').click()
    page.wait_for_function('!document.getElementById("root").inert')


def order_board(page, kind):
    menu(page,'orders')
    page.get_by_role('button',name='货船订单' if kind=='boat' else '卡车订单',exact=False).click()


def source(page, order_id, item, keyboard=False):
    button=page.locator(f'[data-order-id="{order_id}"]').get_by_role('button',name=f'为{item}备货',exact=False)
    if keyboard:
        button.focus(); button.press('Enter')
    else: button.click()


def return_order(page, kind, number, order_id, keyboard=False):
    label=f'返回{"货船" if kind=="boat" else "卡车"}{number}号订单'
    button=page.get_by_role('button',name=label,exact=True)
    if keyboard:
        button.focus(); button.press('Enter')
    else: button.click()
    page.wait_for_function('id => document.activeElement?.dataset.orderId === id',arg=order_id)
    card=page.locator(f'[data-order-id="{order_id}"]')
    assert 'is-focused' in (card.get_attribute('class') or '')
    assert page.get_by_role('button',name='货船订单' if kind=='boat' else '卡车订单',exact=False).get_attribute('aria-pressed')=='true'
    assert page.locator('.supply-return').count()==0
    assert page.get_by_role('button',name='只看可交货',exact=False).get_attribute('aria-pressed')=='false'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')


def nested_source(page):
    source(page,'qa-boat-2','奶油蛋糕')
    page.wait_for_selector('[data-recipe-item="cream_cake"].is-focused')
    page.locator('[data-recipe-item="cream_cake"]').get_by_role('button',name='补充奶油，',exact=False).click()
    page.wait_for_selector('[data-recipe-item="cream"].is-focused')
    page.locator('[data-recipe-item="cream"]').get_by_role('button',name='补充牛奶，',exact=False).click()
    page.wait_for_selector('[data-pen-id="2"].selected')


def check_size(browser,width,height):
    label=f'{width}x{height}'
    ctx,page=context(browser,width,height)
    baseline=game(page)
    order_board(page,'truck')
    source(page,'qa-truck-1','小麦',keyboard=True)
    page.wait_for_selector('.farm-scene')
    return_order(page,'truck',1,'qa-truck-1',keyboard=True)
    preserved(page,baseline)
    passed(f'{label}: keyboard crop source returns to exact truck order without changing saved data')

    source(page,'qa-truck-2','牛奶')
    page.wait_for_selector('[data-pen-id="2"].selected')
    return_order(page,'truck',2,'qa-truck-2')
    preserved(page,baseline)
    passed(f'{label}: animal source returns to second truck card and selects the correct board')

    page.get_by_role('button',name='货船订单',exact=False).click()
    nested_source(page)
    page.get_by_role('button',name='返回奶油配方',exact=True).click()
    page.wait_for_selector('[data-recipe-item="cream"].is-focused')
    page.get_by_role('button',name='返回奶油蛋糕配方',exact=True).click()
    page.wait_for_selector('[data-recipe-item="cream_cake"].is-focused')
    return_order(page,'boat',2,'qa-boat-2')
    preserved(page,baseline)
    if width==844: page.screenshot(path=str(ROOT/'docs/order-supply-return.png'))
    passed(f'{label}: cake -> cream -> milk -> cream -> cake -> original second boat order')

    # Ticking the global clock must not steal focus back from a user's next action.
    toolbar=page.get_by_role('button',name='只看可交货',exact=False)
    toolbar.focus()
    page.wait_for_timeout(1250)
    assert toolbar.evaluate('node => document.activeElement===node')
    preserved(page,baseline)
    passed(f'{label}: periodic game rerender does not steal focus from the user')

    nested_source(page)
    page.locator('.supply-return-close').click()
    assert page.locator('.supply-return').count()==0
    assert page.locator('[data-pen-id="2"].selected').count()==1
    preserved(page,baseline)
    passed(f'{label}: cancel clears entire nested order trail without navigation or data changes')

    order_board(page,'boat')
    source(page,'qa-boat-1','小麦')
    page.wait_for_selector('.farm-scene')
    menu(page,'storage')
    page.wait_for_selector('.fe-storage')
    assert page.locator('.supply-return').count()==0
    preserved(page,baseline)
    passed(f'{label}: ordinary menu navigation ends temporary order context')

    order_board(page,'boat')
    source(page,'qa-boat-1','小麦')
    page.wait_for_selector('.farm-scene')
    page.get_by_role('button',name='进入农场助手',exact=True).click()
    page.wait_for_selector('.assistant-shell')
    page.get_by_role('button',name='返回农场游戏',exact=True).click()
    page.wait_for_selector('.farm-scene')
    assert page.locator('.supply-return').count()==0
    preserved(page,baseline)
    passed(f'{label}: assistant round trip clears order context and preserves four real-data records')
    ctx.close()


def check_order_actions(browser):
    ctx,page=context(browser,844,390)
    order_board(page,'boat')
    source(page,'qa-boat-2','奶油蛋糕')
    page.wait_for_selector('[data-recipe-item="cream_cake"].is-focused')
    return_order(page,'boat',2,'qa-boat-2')
    before=game(page)
    page.locator('[data-order-id="qa-boat-2"]').get_by_role('button',name='更换2号订单',exact=True).click()
    page.wait_for_selector('[data-order-id="qa-boat-2"]',state='detached')
    assert page.locator('.fe-order-card.is-focused').count()==0
    after=game(page)
    assert all(after[k]==before[k] for k in ['coins','gems','xp','inventory','ordersDelivered'])
    menu(page,'farm'); order_board(page,'boat')
    assert page.locator('.fe-order-card.is-focused').count()==0
    preserved(page,after)
    passed('replacement: replacing a focused order clears its highlight; reopening never highlights its replacement or grants rewards')

    source(page,'qa-boat-1','小麦')
    page.wait_for_selector('.farm-scene')
    page.locator('[data-plot-id="1"]').click()
    page.wait_for_function('key => JSON.parse(localStorage.getItem(key)).inventory.wheat===2',arg=GAME_KEY)
    return_order(page,'boat',1,'qa-boat-1')
    before_delivery=game(page)
    page.locator('[data-order-id="qa-boat-1"]').get_by_role('button',name='装好，出发！',exact=True).click()
    page.wait_for_selector('[data-order-id="qa-boat-1"]',state='detached')
    after_delivery=game(page)
    assert after_delivery['coins']==before_delivery['coins']+10
    assert after_delivery['xp']==before_delivery['xp']+24
    assert after_delivery['inventory']['wheat']==1
    assert after_delivery['ordersDelivered']==before_delivery['ordersDelivered']+1
    assert page.locator('.fe-order-card.is-focused').count()==0
    menu(page,'farm'); order_board(page,'boat')
    preserved(page,after_delivery)
    passed('delivery: real harvest fills original shortage; returned boat order delivers exactly once and reopening grants no reward')
    ctx.close()


if __name__=='__main__':
    with sync_playwright() as api:
        browser=api.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
        for size in [(640,360),(844,390),(1280,720)]: check_size(browser,*size)
        check_order_actions(browser)
        ctx,page=context(browser,844,390,'no-preference')
        baseline=game(page)
        order_board(page,'boat'); source(page,'qa-boat-2','奶油蛋糕')
        page.wait_for_selector('[data-recipe-item="cream_cake"].is-focused')
        return_order(page,'boat',2,'qa-boat-2')
        preserved(page,baseline)
        passed('animated navigation: lazy-loaded workshop returns to exact boat card with data unchanged')
        ctx.close(); browser.close()
    assert not ERRORS,ERRORS
    print(json.dumps({'passed_groups':len(PASSED),'page_errors':ERRORS},ensure_ascii=False))
