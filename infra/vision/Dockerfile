# Pinned: Ollama removed mllama (llama3.2-vision) support in 0.30.0.
# 0.24.0 is the last version that can load llama3.2-vision:11b.
# See ollama/ollama#16490. Do NOT bump to :latest without re-validating mllama support.
FROM ollama/ollama:0.24.0

ENV OLLAMA_MODEL=llama3.2-vision:11b

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY infra/vision/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
