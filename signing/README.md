# 独立新版的加密签名备份

`fieldletter-next-signing.tar.gpg` 是使用随机高熵恢复码及 GPG AES-256 加密的签名备份。仓库只保存密文和公开证书摘要，不包含恢复码、未加密私钥或密码。

新包名为 `com.fieldletter.farm.next`，使用独立签名；旧版 `com.fieldletter.farm` 的证书摘要继续保留在原文件中。

恢复码和私下保存的完整备份由维护者保管。将恢复码安全配置为 GitHub Actions Secret `ANDROID_NEXT_SIGNING_RECOVERY` 后，构建任务可在临时目录解密、签名和验证，并清理临时文件。该 Secret 未配置时，CI 只生成候选包；发布任务始终要求匹配独立新版证书。

本机恢复后的私钥目录应位于源码目录以外，权限700，私钥和密码文件权限600。签名使用 `scripts/sign-next-apk.py`；`scripts/verify-next-apk.py` 同时检查包名、源码版本、固定证书、签名前后载荷和16KB对齐。旧版包名会在签名前被拒绝。
