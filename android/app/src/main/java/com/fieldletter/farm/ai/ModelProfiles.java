package com.fieldletter.farm.ai;

import java.util.Arrays;
import java.util.List;

public final class ModelProfiles {
    public static final long GIB = 1024L * 1024 * 1024;
    public static final class Part {
        public final String fileName, sha256;
        public final long bytes;
        Part(String fileName, long bytes, String sha256) {
            this.fileName = fileName; this.bytes = bytes; this.sha256 = sha256;
        }
    }
    public static final class Profile {
        public final String id, name, repository, revision, description;
        public final Part model, projector;
        public final long recommendedMemoryBytes;
        Profile(String size, String revision, Part model, Part projector, long memory, String description) {
            this.id = "qwen3.5-" + size.toLowerCase() + "-q4_k_m";
            this.name = "Qwen3.5 " + size + " Q4_K_M";
            this.repository = "unsloth/Qwen3.5-" + size + "-GGUF";
            this.revision = revision; this.model = model; this.projector = projector;
            this.recommendedMemoryBytes = memory * GIB; this.description = description;
        }
        public long bytes() { return model.bytes + projector.bytes; }
        public long requiredAvailableMemory() { return bytes() + 2 * GIB + bytes() / 6; }
        public String sourceUrl() { return "https://huggingface.co/" + repository + "/tree/" + revision; }
        public String downloadUrl(Part part) { return "https://huggingface.co/" + repository + "/resolve/" + revision + "/" + part.fileName; }
    }
    public static final List<Profile> ALL = Arrays.asList(
        new Profile("0.8B", "6ab461498e2023f6e3c1baea90a8f0fe38ab64d0",
            new Part("Qwen3.5-0.8B-Q4_K_M.gguf", 532517120L, "bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517"),
            new Part("mmproj-F16.gguf", 204987232L, "56e4c6cfe73b0c82e3e82bc518d7591997e61d81f723fc41a586f4fa69ea2453"),
            6, "轻量兼容档，建议 6 GB 以上手机。能力有限，仅辅助整理观察。"),
        new Profile("2B", "f6d5376be1edb4d416d56da11e5397a961aca8ae",
            new Part("Qwen3.5-2B-Q4_K_M.gguf", 1280835840L, "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223"),
            new Part("mmproj-F16.gguf", 668227264L, "7035e9cb8d7c6a9681d07eef9a364783e86ea4cd73faab2eabb4f43a101830c7"),
            8, "推荐平衡档，建议 8 GB 以上手机；中文视觉通用模型，未经农学准确率验证。"),
        new Profile("4B", "e87f176479d0855a907a41277aca2f8ee7a09523",
            new Part("Qwen3.5-4B-Q4_K_M.gguf", 2740937888L, "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4"),
            new Part("mmproj-F16.gguf", 672423616L, "cd88edcf8d031894960bb0c9c5b9b7e1fea6ebee02b9f7ce925a00d12891f864"),
            12, "高内存可选档，建议 12 GB 以上手机。更慢、更占内存，参数量不代表诊断准确率。")
    );
    public static Profile find(String id) {
        for (Profile p : ALL) if (p.id.equals(id)) return p;
        throw new IllegalArgumentException("不支持的模型档位");
    }
    private ModelProfiles() {}
}
