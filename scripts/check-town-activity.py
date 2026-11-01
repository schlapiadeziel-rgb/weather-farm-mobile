#!/usr/bin/env python3
"""Production-browser checks for town activity navigation using isolated test saves.

Requires Python Playwright and Chromium; no project dependency is added.
Run after npm run build and npm run preview: python scripts/check-town-activity.py
Optional URL argument defaults to http://127.0.0.1:4173.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173"
NOW = 1793512800000
GAME_KEY = "fieldletter.game.v1"
REAL = {
    "fieldletter.real-farm.v1": {"version": 1, "profile": {"name": "QA independent record", "production": "wheat", "stage": "seedling", "notes": "preserve"}, "tasks": [], "measurements": []},
    "fieldletter.location.v1": {"name": "QA manual location", "latitude": 30, "longitude": 120, "source": "manual"},
    "fieldletter.clinic-draft.v1": {"version": 1, "updatedAt": "2026-11-01T06:00:00.000Z", "fields": {"category": "crop", "subject": "QA observation", "symptoms": "preserve draft", "onset": "", "extent": "", "affected": "", "total": "", "stage": "", "management": ""}, "speechReviewed": False, "measurementIds": [], "hadMedia": False},
    "field-notes.diagnosis-cases.v1": [],
}
REAL_RAW = {key: json.dumps(value, ensure_ascii=False) for key, value in REAL.items()}
FIXTURE_SOURCE = r'''
import { initialGame, restoreGame } from './src/lib/game.ts';
import { townVisitorReward } from './src/lib/townState.ts';
const now = %s;
const game = initialGame(now);
game.plots = game.plots.map(p => ({ id:p.id, crop:null, growth:0, health:100, moisture:50 }));
game.animals = game.animals.map(p => ({ id:p.id, animal:null, health:100, feed:0, progress:0 }));
game.orders=[];
const guest = (id, name, buildingId, duration, readyAt) => ({
  id, name, buildingId, requirements:{wheat:1}, ...townVisitorReward({wheat:1}),
  arrivedAt:now-300000, ...(readyAt === undefined ? {} : {startedAt:readyAt-duration, readyAt})
});
game.town = { version:1, reputation:8, trainSerial:2, nextTrainAt:now+300000,
  buildings:[{id:'store',level:1},{id:'cafe',level:1},{id:'inn',level:1}],
  visitors:[
    guest('town-1-0','小满','cafe',90000),
    guest('town-1-1','林叔','inn',180000,now),
    guest('town-1-2','阿禾','cafe',90000,now),
    guest('town-2-0','青松','cafe',90000,now+1000),
    guest('town-2-1','南风','inn',180000),
    guest('town-2-2','白露','store',60000,now+30000)
  ] };
console.log(JSON.stringify(restoreGame(game,now)));
''' % NOW
FIXTURE = json.loads(subprocess.check_output(["node", "--import", "tsx", "--input-type=module", "-e", FIXTURE_SOURCE], cwd=ROOT, text=True))
PASSED = []
ERRORS = []


def passed(name):
    PASSED.append(name)
    print("PASS", name, flush=True)


def game(page):
    return page.evaluate("key => JSON.parse(localStorage.getItem(key))", GAME_KEY)


def economy(page):
    current = game(page)
    return {key: current[key] for key in ["coins", "gems", "xp", "inventory", "town", "machines", "layout"]}


def real_unchanged(page):
    assert page.evaluate("keys => Object.fromEntries(keys.map(key => [key,localStorage.getItem(key)]))", list(REAL_RAW)) == REAL_RAW


def board(page):
    page.locator('.fsh-level').click()
    page.wait_for_selector('[role="dialog"][aria-modal="true"]')
    assert page.locator('[data-activity-section]').count() == 6


def town_count(page, count):
    assert page.locator('[data-activity-section="town"] [data-activity-count]').get_attribute('data-activity-count') == str(count)


def return_to_board(page):
    page.locator('.ft-reception-footer button').click()
    board(page)


def assert_target(page, building, visitor):
    page.wait_for_selector(f'[data-town-selected="{building}"]')
    page.wait_for_function('id => document.activeElement?.dataset.townVisitor === id', arg=visitor)
    assert page.locator(f'[data-town-visitor="{visitor}"]').is_visible()
    assert not page.evaluate('document.getElementById("root").inert')


def context(browser, width, height, motion="reduce", fixture=FIXTURE):
    ctx = browser.new_context(viewport={"width": width, "height": height}, reduced_motion=motion)
    ctx.route('https://**', lambda route: route.abort())
    page = ctx.new_page()
    page.on('pageerror', lambda error: ERRORS.append(str(error)))
    storage = {**REAL_RAW, GAME_KEY: json.dumps(fixture, ensure_ascii=False)}
    page.add_init_script('''(() => {
      const NativeDate = Date;
      window.__qaNow = %s;
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [window.__qaNow])); }
        static now() { return window.__qaNow; }
      };
      const storage = %s;
      for (const [key,value] of Object.entries(storage)) localStorage.setItem(key,value);
    })();''' % (NOW, json.dumps(storage, ensure_ascii=False)))
    page.goto(URL)
    page.wait_for_selector('.fsh-level')
    return ctx, page


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), headless=True, args=['--no-sandbox'])
    for width, height in [(640, 360), (844, 390), (1280, 720)]:
        label = f"{width}x{height}"
        ctx, page = context(browser, width, height)
        initial = economy(page)
        board(page)
        town_count(page, 2)
        assert '林叔' in page.locator('[data-activity-section="town"]').inner_text()
        assert '青松' in page.locator('.fa-next').inner_text()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert page.locator('.fa-board-content').evaluate('(node) => node.scrollWidth <= node.clientWidth')
        assert economy(page) == initial
        real_unchanged(page)
        if width == 844:
            page.locator('[data-activity-section="town"]').scroll_into_view_if_needed()
            page.screenshot(path=str(ROOT / 'docs/town-activity-board.png'))
        passed(f"{label}: six sections, ready count, countdown, no horizontal overflow, read-only state")

        button = page.locator('[data-activity-action="town"]')
        button.focus()
        button.press('Enter')
        assert_target(page, 'inn', 'town-1-1')
        assert economy(page) == initial
        real_unchanged(page)
        page.locator('[data-town-building="store"]').click()
        page.wait_for_timeout(1200)
        assert page.locator('[data-town-selected]').get_attribute('data-town-selected') == 'store'
        assert economy(page) == initial
        passed(f"{label}: keyboard route to exact inn guest; timer refresh preserves manual facility")

        return_to_board(page)
        town_count(page, 2)
        page.locator('[data-activity-action="town"]').click()
        assert_target(page, 'inn', 'town-1-1')
        before = game(page)
        reward = next(v for v in before['town']['visitors'] if v['id'] == 'town-1-1')
        page.locator('[data-town-visitor="town-1-1"] [data-town-action="collect"]').click()
        page.wait_for_function('key => JSON.parse(localStorage.getItem(key)).town.visitors.length === 5', arg=GAME_KEY)
        after = game(page)
        assert after['coins'] == before['coins'] + reward['coins']
        assert after['xp'] == before['xp'] + reward['xp']
        assert after['town']['reputation'] == before['town']['reputation'] + reward['reputation']
        assert after['inventory'] == before['inventory']
        assert [v for v in after['town']['visitors'] if v['id'] == 'town-1-1'] == []
        return_to_board(page)
        town_count(page, 1)
        page.locator('[data-activity-action="town"]').click()
        assert_target(page, 'cafe', 'town-1-2')
        assert economy(page) == {key: after[key] for key in initial}
        real_unchanged(page)
        if width == 844:
            page.wait_for_function('!document.querySelector(".game-notice.is-visible")')
            page.screenshot(path=str(ROOT / 'docs/town-activity-focus.png'))
        passed(f"{label}: manual claim pays once; board count falls by one and retargets cafe guest")

        return_to_board(page)
        page.locator('.fa-next-visit').click()
        assert_target(page, 'cafe', 'town-2-0')
        page.locator('[data-town-building="inn"]').click()
        page.evaluate('window.__qaNow += 5000')
        page.wait_for_timeout(1300)
        assert page.locator('[data-town-selected]').get_attribute('data-town-selected') == 'inn'
        return_to_board(page)
        town_count(page, 2)
        assert '白露' in page.locator('.fa-next').inner_text()
        assert economy(page) == {key: after[key] for key in initial}
        real_unchanged(page)
        passed(f"{label}: countdown route to serving guest; time completion updates count without paying")
        ctx.close()

    ctx, page = context(browser, 844, 390, motion='no-preference')
    initial = economy(page)
    board(page)
    page.locator('[data-activity-action="town"]').click()
    assert_target(page, 'inn', 'town-1-1')
    assert economy(page) == initial
    real_unchanged(page)
    passed('844x390: animated page transition retains correct guest focus and read-only state')
    ctx.close()

    legacy = json.loads(json.dumps(FIXTURE))
    del legacy['town']
    ctx, page = context(browser, 844, 390, fixture=legacy)
    board(page)
    town_count(page, 0)
    assert page.locator('[data-activity-action="town"]').count() == 0
    assert page.locator('.fa-next-visit').count() == 0
    real_unchanged(page)
    passed('844x390: legacy save without town loads empty town section without false readiness')
    ctx.close()
    browser.close()

assert not ERRORS, ERRORS
print(json.dumps({"passed_groups": len(PASSED), "page_errors": ERRORS, "screenshots": ['docs/town-activity-board.png', 'docs/town-activity-focus.png']}, ensure_ascii=False))
