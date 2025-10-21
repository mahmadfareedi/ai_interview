#!/usr/bin/env python3
"""
AI Interview Agent (CLI)

Default model: meta-llama/Llama-3.1-8B-Instruct

Supports two providers out of the box:
- Hugging Face Inference API (default)
  env: HUGGINGFACE_API_KEY (or HF_API_KEY)
  url: https://api-inference.huggingface.co/models/{model_id}

- OpenAI-compatible APIs (Together/OpenRouter/Fireworks, etc.)
  env: OPENAI_BASE_URL (e.g., https://api.together.xyz/v1)
       OPENAI_API_KEY
  endpoint: {OPENAI_BASE_URL}/chat/completions

Usage:
  python code.py "What is a star schema?" --context "Snowflake DW" --topic data_engineering

  Or interactive: python code.py (then type a prompt)
"""

import os
import sys
import json
import argparse
import textwrap
from typing import Dict, List
import urllib.request


MODEL_ID = os.getenv("MODEL_ID", "meta-llama/Llama-3.1-8B-Instruct")
DEFAULT_SYSTEM = (
    "You are a concise assistant for interview questions. Answer clearly and briefly."
)


def build_prompt(question: str, context: str = "", topic: str = "", system: str = DEFAULT_SYSTEM) -> str:
    parts = []
    if system:
        parts.append(system)
    if topic:
        parts.append(f"Topic: {topic}")
    if context:
        parts.append(f"Context: {context}")
    parts.append(f"Question: {question}")
    parts.append("Answer succinctly.")
    return "\n\n".join(parts)


def http_post(url: str, headers: Dict[str, str], body: Dict) -> Dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read()
        ct = resp.headers.get("content-type", "")
        if "application/json" in ct:
            return json.loads(raw.decode("utf-8", errors="ignore"))
        return {"text": raw.decode("utf-8", errors="ignore")}


def call_huggingface(question: str, context: str = "", topic: str = "",
                     system: str = DEFAULT_SYSTEM, temperature: float = 0.2,
                     max_tokens: int = 512, model_id: str = MODEL_ID) -> str:
    api_key = os.getenv("HUGGINGFACE_API_KEY") or os.getenv("HF_API_KEY")
    if not api_key:
        raise RuntimeError("Set HUGGINGFACE_API_KEY or HF_API_KEY")
    url = f"https://api-inference.huggingface.co/models/{model_id}"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    prompt = build_prompt(question, context, topic, system)
    body = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": max(16, int(max_tokens)),
            "temperature": float(temperature),
            "return_full_text": False,
        },
    }
    resp = http_post(url, headers, body)
    if isinstance(resp, list) and resp:
        item = resp[0]
        return item.get("generated_text") or json.dumps(item, ensure_ascii=False)
    if isinstance(resp, dict) and "generated_text" in resp:
        return str(resp["generated_text"])
    return resp.get("text") or json.dumps(resp, ensure_ascii=False)


def call_openai_compatible(question: str, context: str = "", topic: str = "",
                           system: str = DEFAULT_SYSTEM, temperature: float = 0.2,
                           max_tokens: int = 512, model_id: str = MODEL_ID) -> str:
    base = os.getenv("OPENAI_BASE_URL")
    key = os.getenv("OPENAI_API_KEY")
    if not base or not key:
        raise RuntimeError("Set OPENAI_BASE_URL and OPENAI_API_KEY for OpenAI-compatible mode")
    url = base.rstrip("/") + "/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}",
    }
    user_content = build_prompt(question, context, topic, system="")
    body = {
        "model": model_id,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        "temperature": float(temperature),
        "max_tokens": max(16, int(max_tokens)),
    }
    resp = http_post(url, headers, body)
    try:
        return (
            resp.get("choices", [{}])[0]
            .get("message", {})
            .get("content")
            or resp.get("choices", [{}])[0].get("text")
        )
    except Exception:
        return json.dumps(resp, ensure_ascii=False)


def main():
    parser = argparse.ArgumentParser(description="AI Interview Agent")
    parser.add_argument("prompt", nargs="*", help="Question to ask")
    parser.add_argument("--context", default="", help="Optional context")
    parser.add_argument("--topic", default="", help="Optional topic tag")
    parser.add_argument("--provider", default=os.getenv("AGENT_PROVIDER", "hf"), choices=["hf", "openai"], help="Provider: hf (HuggingFace) or openai (OpenAI-compatible)")
    parser.add_argument("--model", default=MODEL_ID, help="Model id")
    parser.add_argument("--temperature", type=float, default=float(os.getenv("AGENT_TEMPERATURE", "0.2")))
    parser.add_argument("--max_tokens", type=int, default=int(os.getenv("AGENT_MAX_TOKENS", "512")))
    args = parser.parse_args()

    if not args.prompt:
        # Interactive mode
        print("AI Interview Agent — type your question. Ctrl+C to exit.")
        while True:
            try:
                q = input("Q> ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if not q:
                continue
            try:
                if args.provider == "hf":
                    ans = call_huggingface(q, args.context, args.topic, DEFAULT_SYSTEM, args.temperature, args.max_tokens, args.model)
                else:
                    ans = call_openai_compatible(q, args.context, args.topic, DEFAULT_SYSTEM, args.temperature, args.max_tokens, args.model)
                print("A>", ans.strip())
            except Exception as e:
                print("Error:", e)
        return

    question = " ".join(args.prompt)
    if args.provider == "hf":
        out = call_huggingface(question, args.context, args.topic, DEFAULT_SYSTEM, args.temperature, args.max_tokens, args.model)
    else:
        out = call_openai_compatible(question, args.context, args.topic, DEFAULT_SYSTEM, args.temperature, args.max_tokens, args.model)
    print(out)


if __name__ == "__main__":
    main()

