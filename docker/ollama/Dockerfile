# Thin wrapper over official Ollama. Models are stored on a Docker volume and pulled at
# container start from OLLAMA_MODELS (comma-separated). Add models anytime:
#   - append to OLLAMA_MODELS and recreate the container, or
#   - docker exec -it <container> ollama pull <name>
FROM ollama/ollama:latest

COPY entrypoint.sh /usr/local/bin/docp-ollama-entrypoint.sh
RUN chmod +x /usr/local/bin/docp-ollama-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docp-ollama-entrypoint.sh"]
