#!/usr/bin/env python3
"""Import v0.28-generated backups through the independent edition's production UI.

Requires Python Playwright, Chromium, Git's v0.28.0 tag, and installed project
dependencies. Build first and run a preview separately, then:
  python scripts/check-parallel-migration.py [http://127.0.0.1:4173]
The browser uses isolated test storage. This checks JSON migration, not Android
installation, cross-package filesystem access, or native model-file migration.
"""
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173"
NOW = 1793707200000
GAME = "fieldletter.game.v1"
RECORDS = "fieldletter.real-farm.v1"
CASES = "field-notes.diagnosis-cases.v1"
LOCATION = "fieldletter.location.v1"
DRAFT = "fieldletter.clinic-draft.v1"
PASSED = []
ERRORS = []

LEGACY_FIXTURE = r'''
import { pathToFileURL } from 'node:url';
const root=process.argv[1], now=%s;
const load=name=>import(pathToFileURL(`${root}/src/lib/${name}.ts`).href);
const {initialGame,restoreGame}=await load('game');
const {createGameBackup}=await load('gameSave');
const {createCaseBackup}=await load('caseBackup');
const {createLocalCase,parseDiagnosisOutput}=await load('fieldDiagnosis');
const {initialFarmRecords,parseFarmRecords}=await load('farmRecords');
const game=initialGame(now);
game.coins=1731;game.gems=37;game.xp=1280;game.harvests=7;
game.log=['QA legacy v0.28 backup'];
game.plots=game.plots.map(p=>({id:p.id,crop:null,growth:0,health:100,moisture:50}));
game.animals=game.animals.map(p=>({id:p.id,animal:null,health:100,feed:0,progress:0}));
const canonical=restoreGame(game,now);
const records=parseFarmRecords({version:1,
 profile:{name:'旧版迁移测试农场',production:'番茄',stage:'结果期',notes:'QA backup fixture'},
 tasks:[{id:'legacy-task',title:'旧版巡田记录',dueDate:'2026-11-03',createdAt:'2026-10-28T06:00:00.000Z'}],
 measurements:[{id:'legacy-measure',kind:'soil-ph',value:6.2,place:'QA北棚',instrument:'QA pH计',observedAt:'2026-10-28T06:30:00.000Z'}]});
const observation={category:'crop',subject:'旧版番茄观察',symptoms:'QA isolated observation',
 media:[{id:'legacy-photo',kind:'photo',description:'旧版照片说明，不含照片文件'}]};
const legacyCase={...createLocalCase(observation,parseDiagnosisOutput('',observation),'2026-10-28T07:00:00.000Z'),id:'legacy-case'};
const existingCase={...createLocalCase({...observation,subject:'新版原有观察'},parseDiagnosisOutput('',{...observation,subject:'新版原有观察'}),'2026-10-29T07:00:00.000Z'),id:'new-existing-case'};
const targetRecords=initialFarmRecords();
targetRecords.tasks=[{id:'new-task',title:'新版已有待办',dueDate:'2026-11-04',createdAt:'2026-11-01T06:00:00.000Z'}];
console.log(JSON.stringify({legacyGame:createGameBackup(canonical,now),legacyRecords:{...records,exportedAt:new Date(now).toISOString()},legacyCases:createCaseBackup([legacyCase],new Date(now).toISOString()),targetGame:initialGame(now),targetRecords,existingCase}));
''' % NOW


def fixtures():
    """Use unchanged exporters from the actual released v0.28 source tag."""
    archive = subprocess.check_output(["git", "archive", "v0.28.0", "src/lib", "package.json"], cwd=ROOT)
    with tempfile.TemporaryDirectory(prefix="fieldletter-legacy-migration-") as folder:
        with tarfile.open(fileobj=io.BytesIO(archive)) as tree:
            tree.extractall(folder, filter="data")
        Path(folder, "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
        return json.loads(subprocess.check_output(
            ["node", "--import", "tsx", "--input-type=module", "-e", LEGACY_FIXTURE, folder],
            cwd=ROOT, text=True))


def passed(name):
    PASSED.append(name)
    print("PASS", name, flush=True)


def stored(page, key):
    return page.evaluate("key=>JSON.parse(localStorage.getItem(key))", key)


def raw_keys(page, keys):
    return page.evaluate("keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]))", keys)


def journal(page):
    page.get_by_role("button", name="打开农场菜单", exact=True).click()
    page.locator('[data-game-menu-nav="journal"]').click()
    page.get_by_role("region", name="游戏进度备份").wait_for()


def assistant(page):
    page.get_by_role("button", name="进入农场助手", exact=True).click()
    page.get_by_role("main").filter(has=page.get_by_role("heading", name="照顾农场，也照顾每一个决定。", exact=True)).wait_for()


def upload(locator, name, value):
    locator.set_input_files({"name": name, "mimeType": "application/json", "buffer": json.dumps(value, ensure_ascii=False).encode()})


def check_view(browser, data, width, height):
    label = f"{width}x{height}"
    ctx = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce", accept_downloads=True)
    ctx.route("https://**", lambda route: route.abort())
    page = ctx.new_page()
    page.on("pageerror", lambda error: ERRORS.append(str(error)))
    initial = {
        GAME: data["targetGame"], RECORDS: data["targetRecords"], CASES: [data["existingCase"]],
        LOCATION: {"name": "QA人工位置", "latitude": 30, "longitude": 120, "source": "manual"},
        DRAFT: {"version": 1, "updatedAt": "2026-11-01T06:00:00.000Z", "fields": {"category": "crop", "subject": "QA保留草稿", "symptoms": "待核实文字", "onset": "", "extent": "", "affected": "", "total": "", "stage": "", "management": ""}, "speechReviewed": True, "measurementIds": [], "hadMedia": False},
    }
    page.add_init_script('''(()=>{
      const NativeDate=Date;window.Date=class extends NativeDate{
        constructor(...args){super(...(args.length?args:[%s]));}static now(){return %s;}
      };const storage=%s;for(const [key,value] of Object.entries(storage))localStorage.setItem(key,JSON.stringify(value));
    })();''' % (NOW, NOW, json.dumps(initial, ensure_ascii=False)))
    page.goto(URL)
    page.wait_for_selector(".fsh-level")
    assert stored(page, GAME)["coins"] != data["legacyGame"]["game"]["coins"]
    assert stored(page, RECORDS)["profile"]["name"] == ""
    assert [case["id"] for case in stored(page, CASES)] == ["new-existing-case"]
    passed(f"{label}: isolated new storage does not automatically take legacy progress or records")

    journal(page)
    before = raw_keys(page, [GAME, RECORDS, CASES, LOCATION, DRAFT])
    upload(page.get_by_label("选择游戏备份文件", exact=True), "v0.28-game.json", data["legacyGame"])
    page.get_by_role("heading", name="恢复这份游戏进度？", exact=True).wait_for()
    assert raw_keys(page, list(before)) == before
    page.get_by_role("button", name="保留当前进度", exact=True).click()
    assert raw_keys(page, list(before)) == before
    passed(f"{label}: legacy game preview/cancel has no storage effect")

    upload(page.get_by_label("选择游戏备份文件", exact=True), "v0.28-game.json", data["legacyGame"])
    page.get_by_role("button", name="确认恢复游戏", exact=True).click()
    page.wait_for_function("key=>JSON.parse(localStorage.getItem(key)).coins===1731", arg=GAME)
    assert stored(page, GAME) == data["legacyGame"]["game"]
    assert raw_keys(page, [RECORDS, CASES, LOCATION, DRAFT]) == {key: before[key] for key in [RECORDS, CASES, LOCATION, DRAFT]}
    passed(f"{label}: confirmed legacy game import restores full progress and protects independent real records")

    game_after = raw_keys(page, [GAME])[GAME]
    assistant(page)
    page.get_by_role("button", name="打开农场工作台", exact=True).click()
    page.locator(".backup-strip input[type=file]").wait_for(state="attached")
    before_records = raw_keys(page, [GAME, CASES, LOCATION, DRAFT])
    upload(page.locator(".backup-strip input[type=file]"), "v0.28-farm.json", data["legacyRecords"])
    page.wait_for_function("key=>JSON.parse(localStorage.getItem(key)).measurements.length===1", arg=RECORDS)
    restored = stored(page, RECORDS)
    assert restored["profile"] == data["legacyRecords"]["profile"]
    assert [entry["id"] for entry in restored["tasks"]] == ["new-task", "legacy-task"]
    assert restored["measurements"] == data["legacyRecords"]["measurements"]
    assert raw_keys(page, list(before_records)) == before_records
    passed(f"{label}: real-farm backup merges profile/tasks/measurements without touching game or cases")

    page.get_by_role("button", name="AI诊所", exact=True).click()
    page.get_by_role("button", name="本机案例 1", exact=True).click()
    case_section = page.get_by_role("region", name="案例备份与恢复", exact=True)
    case_section.wait_for()
    unaffected = raw_keys(page, [GAME, RECORDS, LOCATION, DRAFT])
    existing = stored(page, CASES)
    upload(page.get_by_label("选择案例 JSON 备份", exact=True), "v0.28-cases.json", data["legacyCases"])
    page.get_by_role("button", name="仅合并新增 1 个案例", exact=True).wait_for()
    assert stored(page, CASES) == existing
    page.get_by_role("button", name="仅合并新增 1 个案例", exact=True).click()
    page.wait_for_function("key=>JSON.parse(localStorage.getItem(key)).length===2", arg=CASES)
    restored_cases = stored(page, CASES)
    legacy = next(item for item in restored_cases if item["id"] == "legacy-case")
    assert legacy["observation"] == data["legacyCases"]["cases"][0]["observation"]
    assert legacy["importedAt"]
    assert next(item for item in restored_cases if item["id"] == "new-existing-case") == existing[0]
    assert raw_keys(page, list(unaffected)) == unaffected
    passed(f"{label}: case import confirms once, preserves original case and imports media descriptions only")

    case_raw = raw_keys(page, [CASES])[CASES]
    upload(page.get_by_label("选择案例 JSON 备份", exact=True), "v0.28-cases.json", data["legacyCases"])
    page.get_by_role("button", name="仅合并新增 0 个案例", exact=True).wait_for()
    assert page.get_by_role("button", name="仅合并新增 0 个案例", exact=True).is_disabled()
    assert raw_keys(page, [CASES])[CASES] == case_raw
    assert raw_keys(page, list(unaffected)) == unaffected
    page.get_by_role("button", name="取消预览", exact=True).click()
    passed(f"{label}: repeated case backup is recognized as duplicate without extra records or analysis")

    page.get_by_role("button", name="关闭本机案例", exact=True).click()
    page.get_by_role("button", name="返回农场游戏", exact=True).click()
    page.get_by_role("region", name="游戏进度备份").wait_for()
    with page.expect_download() as event:
        page.get_by_role("button", name="导出游戏备份", exact=True).click()
    exported = json.loads(Path(event.value.path()).read_text())
    assert exported["app"] == "fieldletter" and exported["kind"] == "game" and exported["formatVersion"] == 1
    assert exported["game"] == data["legacyGame"]["game"]
    assert raw_keys(page, [GAME])[GAME] == game_after
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
    passed(f"{label}: migrated game re-exports in the compatible schema without reset or horizontal overflow")
    ctx.close()


def main():
    data = fixtures()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), headless=True, args=["--no-sandbox"])
        for width, height in [(640, 360), (844, 390), (1280, 720)]:
            check_view(browser, data, width, height)
        browser.close()
    assert not ERRORS, ERRORS
    print(json.dumps({"passed_groups": len(PASSED), "page_errors": ERRORS, "legacy_source": "v0.28.0", "scope": "backup migration in isolated web storage; Android coexistence and native model imports not measured"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
