# v0.33.0 Android 构建与签名核验

2026-11-25，PR #4 已合并；[Android 构建 45555609874](https://github.com/schlapiadeziel-rgb/weather-farm-mobile/actions/runs/45555609874)成功，源码提交为 `4028b2ec1a16fad36bab01d6fd8bfaad27a35c51`。398 项规则、Python 策略测试、网页同步、Android 原生单元测试及 APK 编译均通过。

## 已核验产物

- Actions artifact ID：`14995608638`，名称“田野来信-新版-Android”，到期时间 2026-12-25。下载的 ZIP SHA-256 与 GitHub artifact digest 一致：`68949969d9a6d9140c51ac4694230f24802ddbed21f408d3193e70957d3b193a`。
- APK 包名 `com.fieldletter.farm.next`，versionName `0.33.0`，versionCode `34`，ARM64，minSDK 23，targetSDK 35。
- APK 的 v1/v2 签名自身有效，16 KB ZIP 对齐通过。APK SHA-256：`949f785f7a72707d52bfb7d7ac406abe7f925e03baede01b4a43703b16e83f35`。
- 源码 ZIP 由上述精确提交的 `git archive --format=zip --prefix=weather-farm-next/` 生成，SHA-256：`9193d6a36e7071c86c7a96658666f29cb16fb3ae0a16fa9f3d7c0874c0dfa961`。

## 正式发布障碍

本次 Actions 日志明确输出：`Independent recovery secret not configured; artifact is a build candidate only.` 仓库 Secrets 查询返回 403；构建实际结果确认此任务未取得 `ANDROID_NEXT_SIGNING_RECOVERY`。

产物证书为 Android Debug，SHA-256：
`14f92612b3f894e17d30c741cca962fc35e5f8e64a1bf6e1a4ce2e2ae5dca485`

独立新版固定证书应为：
`34a55f92759cca03f0d3811029e419477f30ce678a40acf61a9aa27f45a68d60`

因此 `verify-next-apk.py` 在固定证书检查处拒绝该产物。它不能覆盖已经安装的正式版，未上传到公开更新通道，没有创建 v0.33.0 发布或标签。公开安装包仍为 v0.31.0。不要为安装候选包卸载已有正式版。

已检查本环境的工作区、共享下载目录及常见临时/下载位置，仅找到仓库内 GPG 密文，未找到原私下签名备份、私钥或恢复码；可见历史发布和 Actions 产物仅有 APK、源码和校验清单。公开证书和已签 APK 不含私钥，不能用于恢复签名。

## 继续发布

恢复既有私下签名备份或其恢复码后，可直接对这个成功构建的 APK 使用 `scripts/sign-next-apk.py` 签名，再按既有流程验证、将标签指向上述源码提交并发布；不必因签名而重做应用代码。必须继续使用现有包名、固定证书和独立新版附件名。

若配置恢复码到 GitHub Secret 后选择重新构建，记录新构建的精确源码提交、run ID、产物 digest，再核验固定证书。不得把私钥、密码或恢复码提交到源码、公开附件或 Actions 日志。
