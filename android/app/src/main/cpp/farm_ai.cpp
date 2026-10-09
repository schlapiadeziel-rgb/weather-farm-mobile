// MIT. Adapted from NeoLocalAI-Android's llama.android/lib ai_chat.cpp.
#include <jni.h>
#include <android/log.h>
#include <algorithm>
#include <atomic>
#include <memory>
#include <string>
#include <stdexcept>
#include <vector>
#include <unistd.h>
#include "llama.h"
#include "common.h"
#include "chat.h"
#include "sampling.h"
#include "mtmd.h"
#include "mtmd-helper.h"
#include "diagnosis_grammar.h"

namespace {
llama_model *model = nullptr;
llama_context *context = nullptr;
mtmd_context *vision = nullptr;
common_chat_templates_ptr templates;
std::atomic_bool stopped{false};
bool initialized = false;
constexpr int context_size = 8192;
constexpr int batch_size = 128;

void log_message(ggml_log_level level, const char *message, void *) {
    if (level >= GGML_LOG_LEVEL_WARN) __android_log_print(ANDROID_LOG_WARN, "FarmAi", "%s", message);
}

bool abort_compute(void *) { return stopped.load(); }
bool observe_vision(ggml_tensor *tensor, bool ask, void *) {
    if (ask) return tensor->op == GGML_OP_MUL_MAT || tensor->op == GGML_OP_FLASH_ATTN_EXT;
    return !stopped.load();
}

std::string java_string(JNIEnv *env, jstring value) {
    if (!value) return {};
    const jchar *chars = env->GetStringChars(value, nullptr);
    if (!chars) return {};
    std::string result;
    const jsize length = env->GetStringLength(value);
    for (jsize i = 0; i < length; ++i) {
        uint32_t cp = chars[i];
        if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < length && chars[i + 1] >= 0xdc00 && chars[i + 1] <= 0xdfff) {
            cp = 0x10000 + ((cp - 0xd800) << 10) + (chars[++i] - 0xdc00);
        } else if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;
        if (cp < 0x80) result += static_cast<char>(cp);
        else if (cp < 0x800) {
            result += static_cast<char>(0xc0 | (cp >> 6)); result += static_cast<char>(0x80 | (cp & 0x3f));
        } else if (cp < 0x10000) {
            result += static_cast<char>(0xe0 | (cp >> 12)); result += static_cast<char>(0x80 | ((cp >> 6) & 0x3f)); result += static_cast<char>(0x80 | (cp & 0x3f));
        } else {
            result += static_cast<char>(0xf0 | (cp >> 18)); result += static_cast<char>(0x80 | ((cp >> 12) & 0x3f));
            result += static_cast<char>(0x80 | ((cp >> 6) & 0x3f)); result += static_cast<char>(0x80 | (cp & 0x3f));
        }
    }
    env->ReleaseStringChars(value, chars);
    return result;
}

jbyteArray bytes(JNIEnv *env, const std::string &value) {
    jbyteArray result = env->NewByteArray(static_cast<jsize>(value.size()));
    if (result && !value.empty()) env->SetByteArrayRegion(result, 0, value.size(), reinterpret_cast<const jbyte *>(value.data()));
    return result;
}

void fail(JNIEnv *env, const char *message) {
    env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), message);
}

void unload() {
    templates.reset();
    if (vision) mtmd_free(vision);
    if (context) llama_free(context);
    if (model) llama_model_free(model);
    vision = nullptr; context = nullptr; model = nullptr;
}

size_t utf8_prefix(const std::string &value) {
    size_t i = 0;
    while (i < value.size()) {
        const unsigned char c = value[i];
        const size_t length = c < 0x80 ? 1 : (c & 0xe0) == 0xc0 ? 2 : (c & 0xf0) == 0xe0 ? 3 : (c & 0xf8) == 0xf0 ? 4 : 1;
        if (i + length > value.size()) break;
        i += length;
    }
    return i;
}
}

extern "C" JNIEXPORT void JNICALL
Java_com_fieldletter_farm_ai_NativeAi_load(JNIEnv *env, jclass, jstring model_path, jstring projector_path) {
    try {
        unload();
        stopped = false;
        if (!initialized) {
            llama_log_set(log_message, nullptr);
            mtmd_helper_log_set(log_message, nullptr);
            llama_backend_init();
            initialized = true;
        }
        auto mp = llama_model_default_params();
        mp.n_gpu_layers = 0;
        mp.load_mode = LLAMA_LOAD_MODE_MMAP;
        model = llama_model_load_from_file(java_string(env, model_path).c_str(), mp);
        if (!model) throw std::runtime_error("Unable to load the verified GGUF model");
        auto cp = llama_context_default_params();
        cp.n_ctx = context_size; cp.n_batch = batch_size; cp.n_ubatch = batch_size;
        cp.n_threads = std::clamp(static_cast<int>(sysconf(_SC_NPROCESSORS_ONLN)) - 2, 1, 4);
        cp.n_threads_batch = cp.n_threads;
        cp.offload_kqv = false;
        cp.abort_callback = abort_compute;
        context = llama_init_from_model(model, cp);
        if (!context) throw std::runtime_error("Not enough memory to create the inference context");
        auto vp = mtmd_context_params_default();
        vp.use_gpu = false; vp.print_timings = false; vp.warmup = false;
        vp.n_threads = cp.n_threads; vp.image_min_tokens = 256; vp.image_max_tokens = 1024;
        vp.batch_max_tokens = 1024;
        vp.cb_eval = observe_vision;
        vision = mtmd_init_from_file(java_string(env, projector_path).c_str(), model, vp);
        if (!vision || !mtmd_support_vision(vision)) throw std::runtime_error("Unable to load the matching vision projector");
        templates = common_chat_templates_init(model, "");
    } catch (const std::exception &error) {
        unload(); fail(env, error.what());
    }
}

extern "C" JNIEXPORT void JNICALL
Java_com_fieldletter_farm_ai_NativeAi_unload(JNIEnv *, jclass) { unload(); }

extern "C" JNIEXPORT void JNICALL
Java_com_fieldletter_farm_ai_NativeAi_stop(JNIEnv *, jclass) { stopped = true; }

extern "C" JNIEXPORT void JNICALL
Java_com_fieldletter_farm_ai_NativeAi_resetStop(JNIEnv *, jclass) { stopped = false; }

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_fieldletter_farm_ai_NativeAi_generate(JNIEnv *env, jclass, jstring system_text,
        jstring user_text, jobjectArray image_paths, jint max_tokens, jobject sink) {
    try {
        if (!model || !context || !vision) throw std::runtime_error("Load the verified model before generation");
        if (stopped) return bytes(env, "");
        llama_memory_clear(llama_get_memory(context), true);
        const int image_count = image_paths ? env->GetArrayLength(image_paths) : 0;
        if (image_count > 3) throw std::runtime_error("At most three local frames are allowed");
        std::vector<mtmd::bitmap_ptr> owned;
        std::vector<const mtmd_bitmap *> images;
        std::string user = java_string(env, user_text);
        for (int i = 0; i < image_count; ++i) {
            auto path = static_cast<jstring>(env->GetObjectArrayElement(image_paths, i));
            auto wrapper = mtmd_helper_bitmap_init_from_file(vision, java_string(env, path).c_str(), false);
            env->DeleteLocalRef(path);
            if (!wrapper.bitmap) throw std::runtime_error("Unable to read a locally prepared image");
            owned.emplace_back(wrapper.bitmap);
            images.push_back(owned.back().get());
            user = std::string(mtmd_get_marker(vision)) + "\n" + user;
        }
        common_chat_templates_inputs input;
        common_chat_msg system; system.role = "system"; system.content = java_string(env, system_text);
        common_chat_msg question; question.role = "user"; question.content = user;
        input.messages = {system, question}; input.enable_thinking = false;
        input.add_generation_prompt = true; input.use_jinja = true;
        const auto formatted = common_chat_templates_apply(templates.get(), input);
        mtmd_input_text text{formatted.prompt.data(), formatted.prompt.size(), true, true};
        mtmd::input_chunks chunks(mtmd_input_chunks_init());
        if (mtmd_tokenize(vision, chunks.ptr.get(), &text, images.data(), images.size()) != 0)
            throw std::runtime_error("Unable to tokenize the image and text prompt");
        if (stopped) return bytes(env, "");
        const size_t prompt_tokens = mtmd_helper_get_n_tokens(chunks.ptr.get());
        max_tokens = std::clamp(static_cast<int>(max_tokens), 64, 1024);
        if (prompt_tokens + max_tokens + 8 >= context_size)
            throw std::runtime_error("Prompt exceeds the 8192-token limit; shorten observations or remove images");
        llama_pos position = 0;
        if (mtmd_helper_eval_chunks(vision, context, chunks.ptr.get(), 0, 0, batch_size, true, &position) != 0) {
            if (stopped) return bytes(env, "");
            throw std::runtime_error("Local vision or prompt inference failed");
        }
        if (stopped) return bytes(env, "");
        common_params_sampling sampling;
        sampling.temp = 0.2f; sampling.top_p = 0.9f; sampling.top_k = 40;
        sampling.grammar = common_grammar(COMMON_GRAMMAR_TYPE_USER, FARM_DIAGNOSIS_GRAMMAR);
        std::unique_ptr<common_sampler, decltype(&common_sampler_free)> sampler(common_sampler_init(model, sampling), common_sampler_free);
        if (!sampler) throw std::runtime_error("Unable to allocate the token sampler");
        const jmethodID on_token = env->GetMethodID(env->GetObjectClass(sink), "onToken", "([BI)V");
        if (!on_token) throw std::runtime_error("Token callback is missing");
        std::string result, pending;
        for (int i = 0; i < max_tokens && !stopped; ++i) {
            llama_token token = common_sampler_sample(sampler.get(), context, -1);
            if (llama_vocab_is_eog(llama_model_get_vocab(model), token)) break;
            common_sampler_accept(sampler.get(), token, true);
            pending += common_token_to_piece(context, token);
            const size_t prefix = utf8_prefix(pending);
            if (prefix) {
                std::string complete = pending.substr(0, prefix);
                pending.erase(0, prefix); result += complete;
                auto payload = bytes(env, complete);
                env->CallVoidMethod(sink, on_token, payload, i + 1);
                env->DeleteLocalRef(payload);
                if (env->ExceptionCheck()) return nullptr;
            }
            llama_batch batch = llama_batch_get_one(&token, 1);
            if (llama_decode(context, batch) != 0) {
                if (stopped) break;
                throw std::runtime_error("Local token generation failed");
            }
            position++;
        }
        return bytes(env, result);
    } catch (const std::exception &error) { fail(env, error.what()); return nullptr; }
}
