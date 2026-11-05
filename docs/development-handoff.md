# 田野来信：下一位 AI 开发交接

更新日期：2026-11-05。用户要求本轮由当前 AI 完成优化与发布，下一个版本再交给新 AI。用户希望整合完整版本、接近成熟商业游戏的体验，并明确要求游戏内更新。延续现有项目，不要另建替代项目。

## 项目与当前版本

- 仓库：https://github.com/schlapiadeziel-rgb/weather-farm-mobile
- 本地源码：`/workspace/weather-farm-mobile`，主分支 `main`。
- 源码版本：v0.32.0，Android versionName 0.32.0，versionCode 33。尚未跑 Android 构建和签名发布。
- 已公开发布仍是 v0.31.0：源码提交 `cbf960db45f0769db09b2beb72f58f8d819f96bd`，Android versionCode 32。
- APK：https://github.com/schlapiadeziel-rgb/weather-farm-mobile/releases/download/v0.31.0/field-letter-next.apk
- 源码ZIP：https://github.com/schlapiadeziel-rgb/weather-farm-mobile/releases/download/v0.31.0/weather-farm-next-source.zip
- 下一个版本从 v0.33.0 开始，递增 package.json/package-lock.json 和 android/app/build.gradle 的 versionName/versionCode。

中文横屏单机经营游戏；原创地图、动物、小镇和22类工坊插画。真实天气、AI诊所、农业资讯、行情、农事与真实农场记录位于独立“农场助手”，不消耗游戏资源、不与游戏库存混用。React19、TypeScript5.7、Vite6、Capacitor7；规则集中在 src/lib，界面在 src/components，App.tsx连接导航、存档和全局状态。

## 已完成的版本

- v0.28：全部22类工坊插画完成。
- v0.29：独立新版应用；小镇接待提醒、物品来源和补货返回、页面按需加载；旧资料可手动迁移。
- v0.30：卡车/货船订单查缺货来源后，经过多层配方仍能返回并定位原订单。目标使用订单ID+配送类型，不能用卡片序号替代身份。
- v0.31：第一轮经营引导、库存查找/排序与快捷上架、轻量时钟刷新、游戏内更新说明。详情与截图见 docs/quality-pass-v0.31.md。
- v0.32：第一轮完成后的中期经营（扩仓或开新田、工坊连产、稳定交付）、农田/牧场/经营关键按钮的触控与读屏、早期扩仓材料与 9 级前订单批量。详情与截图见 docs/quality-pass-v0.32.md。尚未发布 APK。

v0.32 源码验收为 390 项 TypeScript 规则、生产构建、8 项 Python 策略测试，以及 162 组浏览器检查。截图来自隔离测试存档。v0.31 的云端时钟基准仍只说明 CPU 计算，不可宣称为真机性能。

## 关键实现与边界

- `src/lib/farmJourney.ts` / `FarmJourneyCard.tsx`：以真实harvests/productsCollected/ordersDelivered推导三步目标，不写新存档字段、不发额外奖励。考虑真实readyAt、仓库容量、种子/饲料、动物购买与船单等级；完成后不显示；详情、工具、提示、弹窗和补货路径显示时隐藏。
- `src/lib/farmSeason.ts` / `FarmSeasonCard.tsx`：第一轮完成后的中期三步。扩仓或开新田看容量和已解锁田块，工坊连产看队列长度、工坊数量或槽位，稳定交付看 ordersDelivered 达到 4。不写新存档字段、不发奖励。未解锁船单不能成为目标。队列收空后，若没有新工坊或额外槽位，连产提醒会再出现。显示和隐藏条件与第一轮相同。
- `src/lib/inventoryView.ts` / EconomyPanels.tsx：库存搜索、Unicode规范化、仓库类别和数量稳定排序。“去上架”仅预填商品、数量1与标准价，最终listForSale提交才扣货，不能改成点击预览就出售。
- `refreshGameClock`在`src/lib/game.ts`：专供App的时钟刷新，保留未改变分支引用；经济动作继续使用`tickGame`产生独立深副本。绝不能把plant/harvest/feed/collect/queue等动作里的tickGame直接替换为共享引用刷新，否则可能原地扣改旧存档。
- `src/lib/orderSupply.ts` / SupplyReturn.tsx / App.tsx：配方返回栈与订单/访客来源；普通导航、取消与恢复存档清除上下文。时钟和库存刷新不能反复抢焦点。
- `gameSave.ts`处理校验、异常恢复副本、导出/导入白名单。改变Game字段前同时考虑旧存档、备份格式与恢复测试。真实农场记录/案例/位置保持独立。
- 生产/小镇/经营面板按需加载；不要意外改回首屏同步导入。

## 开发与验收

```bash
npm ci
npm test
npm run build
python -m unittest discover -s tests -p 'test_next*.py'
node --import tsx scripts/benchmark-game-clock.ts
```

浏览器脚本需要Python Playwright和Chromium，默认`/usr/bin/chromium`，可设置CHROMIUM_PATH；先启动生产preview再传URL。可复用：check-quality-pass.py、check-order-supply-return.py、check-town-supply-return.py、check-lazy-pages.py、check-item-sources.py、check-town-activity.py。覆盖640×360、844×390、1280×720及减少动态效果。不要把展示夹具误当玩家资料；运行脚本会更新少量文档截图，检查git diff，避免混入无关重绘。

本机只备有Android Build-tools35，完整Android/NDK编译走`.github/workflows/android.yml`：Node22、Java21、Android35、NDK28.2、CMake3.31.6；包括原生更新单元测试。构建产物名“田野来信-新版-Android”，其中APK为“田野来信-新版.apk”。

## 更新与签名：必须延续

新应用ID为`com.fieldletter.farm.next`，名称“田野来信·新版”。Java/JNI namespace保留`com.fieldletter.farm`，Manifest组件使用明确类名，Provider authorities基于applicationId。不要为了升级重新换包名或重新生成签名。

新固定证书SHA-256：
`34a55f92759cca03f0d3811029e419477f30ce678a40acf61a9aa27f45a68d60`

证书pin：`docs/android-next-signing-certificate.sha256`。仓库只保存`signing/fieldletter-next-signing.tar.gpg`密文；私钥、密码、恢复码与完整私下备份不进入GitHub源码、公开附件或Actions产物。维护者另行保管私下备份；参阅signing/README.md。仓库恢复Secret名ANDROID_NEXT_SIGNING_RECOVERY，不能假定已配置；当前发布使用本机固定签名，再由Actions验证和上传。

v0.28及更早旧应用是`com.fieldletter.farm`，原密钥已丢失且搜索无果。用户已同意独立新版方案。旧APK无法提取原私钥，不要再次浪费时间尝试恢复。保留原证书文件`docs/android-signing-certificate.sha256`。旧应用与新版可以并存，首次迁移见docs/parallel-installation.md；v0.29之后相同新版包名直接覆盖更新，保留本应用资料。

游戏内入口：左上角农场菜单→检查更新→下载→安装更新→安卓系统确认；首次可能需允许该应用安装来源，再回游戏继续安装。更新器检查版本、大小、SHA-256、同包名和同签名。发布附件必须使用`field-letter-next.apk`、`SHA256SUMS-next.txt`、`weather-farm-next-source.zip`，不能混入旧通道的`field-letter.apk`或`SHA256SUMS.txt`，以免旧应用误提示跨包名更新。

## 发布流程

1. 完成代码/验收并推送main，等待Build Android APK成功，记录精确source SHA和run ID。
2. 从对应Actions artifact下载原APK，核对artifact digest、head SHA与构建状态。连接器可返回File Service下载引用，不要将该ID误传Sediment download_file。
3. 在源码目录之外使用既有私钥，通过scripts/sign-next-apk.py签名。scripts/verify-next-apk.py核对包名、源码版本、固定证书、签名前后载荷和16KB对齐；不要跳过。
4. tag必须指向该成功构建的源码SHA。首次发布在临时交付commit/branch放公开签名APK及source-commit.txt，只放这两项公开文件，绝不放私钥。
5. dispatch release-next.yml，输入tag、build_run_id、signed_apk_ref完整SHA。发布任务核对构建成功、原构建源码和tag一致、签名及载荷后上传三附件。
6. 发布后重新下载公开APK、清单和源码，核对hash、签名、源码git archive；使用实际已安装版本的appUpdate解析器检查公开release JSON与checksum，确保识别新版本、旧v0.28忽略、新版本不重复提示自身。
7. 核验完成后删除临时交付分支；补录docs验证结果，文档提交可用[skip ci]避免重复构建。

当前连接器的仓库Secrets API可能403，本地gh向uploads.github.com上传可能401；可用Actions runner上传，不要索要用户在聊天里粘贴密钥或密码。GitHub API偶有500，先读实际release状态；附件已齐而发布标志失败时只重试发布编辑。不要盲目重跑带--clobber的整任务删除已公开附件。

## 下一版建议

v0.32 已补上中期引导、关键按钮触控和 100/125/150 扩仓材料，以及 9 级前的订单批量。下一步先基于真机录屏和性能采样测启动、滑动、内存、功耗和原生模型，再决定绘制优化。175 起扩仓材料回到原档位（175 为每种 4 份），同一种材料仍约每 65 次收获出现一次。若这一档仍然偏慢，再单独调，不要整表重做。工坊连产收完队列后会再次提醒，除非新建工坊或增加槽位；若要让“曾经连产”永久完成，需要一个只增不减的计数，并同时改旧存档与备份测试。用户的“顶级游戏”是持续品质目标，不代表当前已达到商业大作的全部系统；每轮集中交付可验证的完整改进，不夸大真机结果。

## v0.31.0发布核验结果

2026-11-05完成公开发布。[Android构建42011538425](https://github.com/schlapiadeziel-rgb/weather-farm-mobile/actions/runs/42011538425)及[发布流程42012584168](https://github.com/schlapiadeziel-rgb/weather-farm-mobile/actions/runs/42012584168)均成功。APK确认包名com.fieldletter.farm.next、versionName0.31.0、versionCode32、ARM64和minSDK23。

公开三个附件重新下载后，大小与GitHub元数据一致、SHA-256清单通过；固定新证书、签名前后载荷与16KB对齐通过；源码ZIP与标签cbf960db45f0769db09b2beb72f58f8d819f96bd的git archive逐字节一致。实际v0.29/v0.30解析器均能识别公开v0.31.0并得到与下载APK一致的SHA；v0.28旧包名解析器返回null，当前v0.31.0不重复提示自身。临时公开APK交付分支已删除。

```text
9051c112ff1aef5b4ef63f03b48f59f8b5385c8961eb852c82ed642f71a00086  field-letter-next.apk
3e040f2c1198e98e35ad507b8d91578e77bba5684d2d10469e3f6863f439ae7f  weather-farm-next-source.zip
```
