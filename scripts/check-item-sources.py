#!/usr/bin/env python3
"""Check item-source labels, actual destinations and read-only source navigation.

Uses isolated, validated test saves, not a real player's farm. Raw fruit/fish/ore
are checked through production ingredients or orders because town visitors accept
only crops, animal products and processed products. Requires Python Playwright
and Chromium, with no project dependency change. Build and preview first:
  python scripts/check-item-sources.py [http://127.0.0.1:4173]
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
import { MACHINES } from './src/lib/farmContent.ts';
import { townVisitorReward } from './src/lib/townState.ts';
import { farmVisitorReward } from './src/lib/farmVisitorState.ts';
const now=%s, game=initialGame(now);
game.xp=20*31**2;
game.plots=game.plots.map(p=>({id:p.id,crop:null,growth:0,health:100,moisture:50}));
game.animals=[{id:1,animal:'chicken',health:100,feed:0,progress:0},{id:2,animal:'cow',health:100,feed:0,progress:0},{id:3,animal:null,health:100,feed:0,progress:0}];
game.inventory={};
game.machines=MACHINES.map(machine=>({id:machine.id,slots:2,queue:[]}));
game.orders=['plank','coffee_bean','gold_ore','fish_fillet'].map(item=>({id:'qa-'+item,kind:'truck',requirements:{[item]:1},coins:10,xp:5}));
const guest=(index,name,buildingId,item)=>({id:`town-${Math.floor(index/3)+1}-${index%%3}`,name,buildingId,requirements:{[item]:1},...townVisitorReward({[item]:1}),arrivedAt:now-300000});
game.town={version:1,reputation:8,trainSerial:2,nextTrainAt:now+300000,
 buildings:[{id:'store',level:1},{id:'cafe',level:1},{id:'inn',level:1}],
 visitors:[guest(0,'小满','cafe','wheat'),guest(1,'林叔','inn','milk'),guest(2,'阿禾','cafe','beeswax'),guest(3,'青松','inn','apple_pie'),guest(4,'小溪','cafe','fish_sushi'),guest(5,'白露','inn','iron_bar')]};
game.farmVisitors={version:1,serial:1,nextArrivalAt:0,visitor:{id:'farm-visitor-1',profileId:'seed_post',item:'honey',quantity:1,...farmVisitorReward('honey',1),arrivedAt:now-300000}};
const normal=restoreGame(game,now);
const locked=initialGame(now);locked.inventory={};locked.plots=game.plots;locked.animals=[{id:1,animal:'chicken',health:100,feed:0,progress:0},{id:2,animal:null,health:100,feed:0,progress:0},{id:3,animal:null,health:100,feed:0,progress:0}];
locked.orders=[{id:'qa-locked-fish',kind:'truck',requirements:{fish_fillet:1},coins:10,xp:5}];
console.log(JSON.stringify({normal,locked:restoreGame(locked,now)}));
''' % NOW
FIXTURES=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',FIXTURE_SOURCE],cwd=ROOT,text=True))
PASSED=[]
ERRORS=[]


def passed(name):
    PASSED.append(name)
    print('PASS',name,flush=True)


def game(page):
    return page.evaluate('key=>JSON.parse(localStorage.getItem(key))',GAME_KEY)


def unchanged(page,baseline):
    assert game(page)==baseline
    assert page.evaluate('keys=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]))',list(REAL_RAW))==REAL_RAW
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')


def context(browser,width,height,fixture='normal',motion='reduce'):
    ctx=browser.new_context(viewport={'width':width,'height':height},reduced_motion=motion)
    ctx.route('https://**',lambda route:route.abort())
    page=ctx.new_page()
    page.on('pageerror',lambda error:ERRORS.append(str(error)))
    storage={**REAL_RAW,GAME_KEY:json.dumps(FIXTURES[fixture],ensure_ascii=False)}
    page.add_init_script('''(()=>{const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[%s]));}static now(){return %s;}};for(const [key,value] of Object.entries(%s))localStorage.setItem(key,value);})();''' % (NOW,NOW,json.dumps(storage,ensure_ascii=False)))
    page.goto(URL)
    page.wait_for_selector('.fsh-level')
    return ctx,page


def menu(page,tab):
    page.get_by_role('button',name='打开农场菜单',exact=True).click()
    page.locator(f'[data-game-menu-nav="{tab}"]').click()


def choose_guest(page,building,visitor):
    page.locator(f'[data-town-building="{building}"]').click()
    page.locator(f'[data-town-visitor="{visitor}"]').wait_for(state='visible')


def town_source(page,visitor,label,keyboard=False):
    button=page.locator(f'[data-town-visitor="{visitor}"] .ft-missing-items button')
    assert button.inner_text().strip()==f'去{label}'
    if keyboard:
        button.focus();button.press('Enter')
    else:button.click()


def guest_return(page,building,visitor):
    button=page.locator('[data-supply-return="town"] .supply-return-main')
    button.focus();button.press('Enter')
    page.wait_for_selector(f'[data-town-selected="{building}"]')
    page.wait_for_function('id=>document.activeElement?.dataset.townVisitor===id',arg=visitor)


def recipe(page,item):
    page.wait_for_selector(f'[data-recipe-item="{item}"].is-focused')


def ingredient(page,recipe_id,item_name,label):
    page.locator(f'[data-recipe-item="{recipe_id}"]').get_by_role('button',name=f'补充{item_name}，去{label}',exact=True).click()


def recipe_return(page,name,item):
    page.get_by_role('button',name=f'返回{name}配方',exact=True).click()
    recipe(page,item)


def exploration(page,label):
    page.wait_for_selector('.fe-exploration')
    assert page.get_by_role('button',name=label,exact=True).get_attribute('aria-pressed')=='true'


def order_source(page,order,item):
    page.locator(f'[data-order-id="{order}"]').get_by_role('button',name=f'为{item}备货，',exact=False).click()


def check_viewport(browser,width,height):
    label=f'{width}x{height}'
    ctx,page=context(browser,width,height)
    baseline=game(page)
    menu(page,'town')
    choose_guest(page,'cafe','town-1-0')
    town_source(page,'town-1-0','农田',keyboard=True)
    page.wait_for_selector('.farm-scene')
    assert page.locator('.primary-action').filter(has_text='播种小麦').count()==1
    guest_return(page,'cafe','town-1-0')
    unchanged(page,baseline)
    passed(f'{label}: crop source selects crop and keyboard return preserves complete save')

    choose_guest(page,'inn','town-1-1')
    town_source(page,'town-1-1','牧场')
    page.wait_for_selector('[data-pen-id="2"].selected')
    guest_return(page,'inn','town-1-1')
    unchanged(page,baseline)
    passed(f'{label}: actual animal source selects cow pen and returns exact guest')

    cases=[('cafe','town-1-2','蜂产品工坊','beeswax','蜂蜡','蜂蜜','蜂箱','蜂箱'),
           ('inn','town-2-0','馅饼炉','apple_pie','苹果馅饼','苹果','果园','果园'),
           ('cafe','town-2-1','寿司铺','fish_sushi','鱼寿司','鱼肉','鱼塘','河畔钓鱼'),
           ('inn','town-2-2','冶炼炉','iron_bar','铁锭','铁矿石','矿山','矿山')]
    for building,visitor,machine,item,name,raw,source_label,tab_label in cases:
        choose_guest(page,building,visitor)
        town_source(page,visitor,machine)
        recipe(page,item)
        source=page.locator(f'[data-recipe-item="{item}"]').get_by_role('button',name=f'补充{raw}，去{source_label}',exact=True)
        assert source.count()==1
        if width==844 and item=='apple_pie':
            source.scroll_into_view_if_needed()
            page.screenshot(path=str(ROOT/'docs/item-sources.png'))
        source.click()
        exploration(page,tab_label)
        recipe_return(page,name,item)
        guest_return(page,building,visitor)
        unchanged(page,baseline)
        passed(f'{label}: {name} resolves actual workshop then {raw} source label and exploration tab; exact return')
    ctx.close()

    ctx,page=context(browser,width,height)
    baseline=game(page)
    page.locator('.farm-visitor-entry').click()
    source=page.locator('[data-visitor-action="source"]')
    assert source.inner_text().strip()=='去蜂箱收集'
    source.click()
    exploration(page,'蜂箱')
    unchanged(page,baseline)
    passed(f'{label}: door neighbor honey source names hive and navigates without trade')
    ctx.close()

    for order,item,tab in [('qa-plank','木板','我的库存'),('qa-coffee_bean','咖啡豆','果园'),('qa-gold_ore','金矿石','矿山')]:
        ctx,page=context(browser,width,height)
        baseline=game(page)
        menu(page,'orders')
        page.wait_for_selector('.fe-orders')
        order_source(page,order,item)
        if tab=='我的库存':
            page.wait_for_selector('.fe-storage')
            assert page.get_by_role('button',name=tab,exact=True).get_attribute('aria-pressed')=='true'
        else:exploration(page,tab)
        unchanged(page,baseline)
        passed(f'{label}: order source {item} routes to {tab} without buying or changing save')
        ctx.close()

    ctx,page=context(browser,width,height,fixture='locked')
    baseline=game(page)
    menu(page,'orders')
    order_source(page,'qa-locked-fish','鱼肉')
    exploration(page,'河畔钓鱼')
    assert page.locator('.fe-adventure-info button').is_disabled()
    unchanged(page,baseline)
    passed(f'{label}: locked fish source may be viewed without bypassing level or spending')
    ctx.close()


if __name__=='__main__':
    with sync_playwright() as api:
        browser=api.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
        for size in [(640,360),(844,390),(1280,720)]:check_viewport(browser,*size)
        browser.close()
    assert not ERRORS,ERRORS
    print(json.dumps({'passed_groups':len(PASSED),'page_errors':ERRORS,'screenshot':'docs/item-sources.png'},ensure_ascii=False))
