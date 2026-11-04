# v0.29.0 原包名候选版的历史发布状态

后续已改为新包名和新签名的独立安装通道，见[独立安装与迁移](parallel-installation.md)。以下保留原包名候选版的核验记录，不代表独立新版的发布状态。

2026-11-01：优化已合入主分支，Android 构建成功；公开 APK 发布停在固定签名核验前。

- 源码提交：`7232aab8b2be102ab254796089bc3d4d71d2fd8a`。
- [Android 构建 41296095998](https://github.com/schlapiadeziel-rgb/weather-farm-mobile/actions/runs/41296095998)成功，产物大小 26,667,391 字节。
- 本次 CI 的 `KEYSTORE_BASE64`、`KEYSTORE_PASSWORD`、`KEY_ALIAS`、`KEY_PASSWORD` 均为空，固定签名步骤未执行。
- 产物 SHA-256：`f4b0c1faadc30f582ebf2f02d2a7f30ee79cae1d0b904a1a63aa99e0b4ea40a3`。
- 产物所含证书摘要：`c8eacf4eb9d5c049ffae3583124736ec84dbe1630655942839b8fd398214a483`。
- 既有固定证书摘要：`29680e84d044dfbbbab9cf44e79af8dc79a55e3044d1a60c9f33bbfc99275a4f`，与产物不匹配。

下载的 CI 归档已核对 GitHub 返回的 SHA-256；以上产物证书由本地 `keytool -printcert -jarfile` 读取。没有把开发签名包公开为旧版更新，也没有更改固定证书或生成替代密钥。v0.29.0 的 GitHub 发布草稿已创建，未附 APK 或源码附件；源码已在主分支，v0.28.0 继续作为已发布版本。当前连接上传发布附件返回 HTTP 401；既有发布工作流在签名恢复后可负责完整附件上传。

继续发布需要恢复原 `fieldletter-release.p12` 及密码，或由原密钥持有人安全配置同一密钥的四项 GitHub Actions 签名秘密。密钥不应粘贴进聊天或提交到仓库。重新构建后，使用既有 `scripts/verify-update-apk.py` 和发布工作流核对固定证书、应用内容、源码提交、版本标签和构建结果，再发布 APK 与完整 SHA256SUMS。

原签名流程与文件权限见 [安卓更新说明](android-updates.md)。不能从已发布 APK 的公开证书恢复私钥。
