python3 -m llama_cpp.server \
  --model /Users/a1/Downloads/models/qwen3.6/Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf \
  --clip_model_path /Users/a1/Downloads/models/qwen3.6/mmproj-F16.gguf \
  --chat_format chatml \
  --n_gpu_layers -1 \
  --n_ctx 262144 \
  --n_batch 512 \
  --n_threads 8 \
  --host 0.0.0.0 \
  --port 1025 \
  --chat_template_kwargs '{"enable_thinking": false}'

llama-server \
  -m /Users/a1/Downloads/models/qwen3.6/35B/Qwen3.6-27B-UD-Q8_K_XL.gguf \
  --mmproj /Users/a1/Downloads/models/qwen3.6/35B/mmproj-F16.gguf \
  --host 0.0.0.0 \
  --port 1025 \
  -c 262144 \
  -b 512 \
  -t 8 \
  -ngl 999 \
  --jinja \
  --alias qwen3.6 \
  --chat-template-kwargs '{"enable_thinking":false}'

llama-server \
  -m /Users/a1/Downloads/models/qwen3.6/27B/Qwen3.6-27B-UD-Q8_K_XL.gguf \
  --mmproj /Users/a1/Downloads/models/qwen3.6/27B/mmproj-F16.gguf \
  --host 0.0.0.0 \
  --port 1025 \
  -c 262144 \
  -b 512 \
  -t 8 \
  -ngl 999 \
  --jinja \
  --alias qwen3.6 \
  --reasoning off

llama-server \
  --model /Users/a1/Downloads/models/Tencent-Hunyuan--Hy-MT2-1.8B-GGUF/Hy-MT2-1.8B-Q8_0.gguf  \
  --jinja \
  -ngl 0 \
  -n 64 \
  --host 0.0.0.0 \
  --port 2025 \
  --alias hy

# docker 部署llama-server（非mac机， mac直接用编译后的llama-server启动）
docker run -itd --name llama-server --gpus all --ipc=host -v /mnt/d/downloads/models:/models -p 1025:1025 ghcr.io/ggml-org/llama.cpp:full-cuda --server

# 再执行docker exec -it llama-server bash进入容器后，执行下面部署命令
./llama-server -m /models/qwen3/35B/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf --mmproj /models/qwen3/35B/mmproj-BF16.gguf --port 1025 --host 0.0.0.0 -c 262144 -b 512 -t 8 -ngl 999 --jinja --alias qwen3.6 --reasoning off


# 一个命令在后台启动模型服务：
docker run -d \
  --name llama-server \
  --restart unless-stopped \
  --gpus all \
  --ipc=host \
  -v /mnt/d/downloads/models:/models:ro \
  -p 1025:1025 \
  --log-opt max-size=100m \
  --log-opt max-file=3 \
  ghcr.io/ggml-org/llama.cpp:full-cuda \
  -m /models/qwen3/35B/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf \
  --mmproj /models/qwen3/35B/mmproj-BF16.gguf \
  --port 1025 \
  --host 0.0.0.0 \
  -c 262144 \
  -b 512 \
  -t 8 \
  -ngl 999 \
  --jinja \
  --alias qwen3.6 \
  --reasoning off