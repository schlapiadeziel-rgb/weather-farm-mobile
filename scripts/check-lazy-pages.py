#!/usr/bin/env python3
"""Check production page chunks and navigation with an isolated new-farm save.

Requires Python Playwright and Chromium; no project dependency is added.
Run after npm run build and npm run preview: python scripts/check-lazy-pages.py
Optional URL argument defaults to http://127.0.0.1:4173. Set CHROMIUM_PATH when needed.
These checks record requested assets and behavior, not device loading speed or FPS.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173"
ORIGIN = urlsplit(URL).netloc
NOW = 1793512800000
GAME_KEY = "fieldletter.game.v1"
FIXTURE_SOURCE = """
import { initialGame, restoreGame } from './src/lib/game.ts';
const now = %s;
console.log(JSON.stringify(restoreGame(initialGame(now), now)));
""" % NOW
FIXTURE = json.loads(subprocess.check_output(
    ["node", "--import", "tsx", "--input-type=module", "-e", FIXTURE_SOURCE],
    cwd=ROOT, text=True,
))
ASSETS = {}
for module in ["FarmTown", "ProductionPanel", "EconomyPanels"]:
    files = list((ROOT / "dist/assets").glob(f"{module}-*.js"))
    assert len(files) == 1, f"Expected one production chunk for {module}; build the lazy-page source first: {files}"
    ASSETS[module] = files[0].name

ROUTES = [
    ("production", "ProductionPanel", ".farm-production-panel", ".fp-layout"),
    ("town", "FarmTown", ".farm-town-panel", ".ft-layout"),
    ("orders", "EconomyPanels", ".fe-orders", ".fe-orders .fe-tabs"),
    ("storage", "EconomyPanels", ".fe-storage", ".fe-storage .fe-tabs"),
    ("explore", "EconomyPanels", ".fe-exploration", ".fe-exploration .fe-tabs"),
]
PASSED = []
ERRORS = []
FAILED_LOCAL = []
ASSET_RUNS = []


def passed(name):
    PASSED.append(name)
    print("PASS", name, flush=True)


def read_game(page):
    return page.evaluate("key => JSON.parse(localStorage.getItem(key))", GAME_KEY)


def js_names(requests):
    return [Path(urlsplit(url).path).name for url in requests
            if urlsplit(url).netloc == ORIGIN and urlsplit(url).path.endswith(".js")]


def assert_layout(page, selector):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Document has horizontal overflow"
    assert page.locator(selector).evaluate("node => node.scrollWidth <= node.clientWidth"), f"Panel has horizontal overflow: {selector}"


def visit(page, destination, selector, style_selector):
    page.get_by_role("button", name="打开农场菜单", exact=True).click()
    page.locator(f'[data-game-menu-nav="{destination}"]').click()
    page.wait_for_selector(selector)
    page.wait_for_function("!document.getElementById('root').inert")
    assert page.locator(style_selector).evaluate("node => getComputedStyle(node).display") == "flex", f"Page stylesheet not applied: {destination}"
    assert_layout(page, selector)


def new_page(browser, width, height, motion):
    ctx = browser.new_context(viewport={"width": width, "height": height}, reduced_motion=motion)
    ctx.route("https://**", lambda route: route.continue_()
              if urlsplit(route.request.url).netloc == ORIGIN else route.abort())
    page = ctx.new_page()
    page.set_default_timeout(15000)
    requests = []
    page.on("request", lambda request: requests.append(request.url))
    page.on("pageerror", lambda error: ERRORS.append(str(error)))
    page.on("requestfailed", lambda request: FAILED_LOCAL.append(request.url)
            if urlsplit(request.url).netloc == ORIGIN else None)
    page.on("response", lambda response: FAILED_LOCAL.append(f"{response.status}: {response.url}")
            if urlsplit(response.url).netloc == ORIGIN and response.status >= 400 else None)
    page.add_init_script("""(() => {
      const NativeDate = Date;
      const now = %s;
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
      };
      localStorage.setItem(%s, %s);
    })();""" % (NOW, json.dumps(GAME_KEY), json.dumps(json.dumps(FIXTURE, ensure_ascii=False))))
    page.goto(URL)
    page.wait_for_selector(".fsh-level")
    page.wait_for_load_state("networkidle")
    return ctx, page, requests


def check_context(browser, width, height, motion, revisit):
    label = f"{width}x{height}/{motion}"
    ctx, page, requests = new_page(browser, width, height, motion)
    initial = read_game(page)
    first_paint_assets = sorted(set(js_names(requests)))
    assert not set(ASSETS.values()).intersection(first_paint_assets), first_paint_assets
    assert_layout(page, ".game-shell")
    passed(f"{label}: farm starts without town, production or economy page chunks")
    visited_modules = set()
    for destination, module, selector, style_selector in ROUTES:
        visit(page, destination, selector, style_selector)
        visited_modules.add(module)
        names = js_names(requests)
        assert ASSETS[module] in names, f"Page chunk not requested: {module}"
        assert not {ASSETS[name] for name in ASSETS if name not in visited_modules}.intersection(names), names
        assert read_game(page) == initial, f"Pure navigation changed game save: {destination}"
        passed(f"{label}: first open {destination}, local chunk and CSS present, save unchanged, no overflow")
    before_revisit = {name: js_names(requests).count(asset) for name, asset in ASSETS.items()}
    assert before_revisit == {name: 1 for name in ASSETS}, before_revisit
    if revisit:
        for destination, _, selector, style_selector in ROUTES:
            visit(page, destination, selector, style_selector)
        assert read_game(page) == initial
        assert {name: js_names(requests).count(asset) for name, asset in ASSETS.items()} == before_revisit
        passed(f"{label}: revisiting all five pages reuses the same three loaded modules; save unchanged")
    ASSET_RUNS.append({
        "viewport": f"{width}x{height}", "reduced_motion": motion,
        "first_farm_js": first_paint_assets,
        "page_module_requests": {ASSETS[name]: count for name, count in before_revisit.items()},
        "all_local_js": sorted(set(js_names(requests))),
    })
    ctx.close()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"),
        headless=True, args=["--no-sandbox"],
    )
    for width, height in [(640, 360), (844, 390), (1280, 720)]:
        check_context(browser, width, height, "reduce", revisit=True)
    check_context(browser, 844, 390, "no-preference", revisit=False)
    browser.close()

assert not ERRORS, ERRORS
assert not FAILED_LOCAL, FAILED_LOCAL
print(json.dumps({
    "passed_groups": len(PASSED), "page_errors": ERRORS,
    "failed_local_requests": FAILED_LOCAL, "asset_runs": ASSET_RUNS,
}, ensure_ascii=False))
