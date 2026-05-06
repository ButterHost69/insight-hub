import logging
from groq import Groq

log = logging.getLogger(__name__)

GroqClient: Groq
LLM_Mode: str

MAX_COMPLETION_TOKENS = 2500


def setup_llm(mode: str | None, api_key: str = "") -> None:
    if mode is None:
        raise Exception("AI_ASK_MODE cannot be None")

    global LLM_Mode
    LLM_Mode = mode

    global GroqClient
    if mode == "local":
        pass
    elif mode == "api":
        global GroqClient
        if api_key == "":
            raise Exception("(setup_llm) GROQ_API cannot be empty for API Mode for LLM Calls")
        GroqClient = Groq(
            api_key=api_key
        )
        return


def perform_llm_call(prompt: str) -> str:
    if LLM_Mode == "api":
        est_input_tokens = len(prompt) // 4
        log.info(f"📊 LLM call | est input: ~{est_input_tokens} tokens | max output: {MAX_COMPLETION_TOKENS} | total requested: ~{est_input_tokens + MAX_COMPLETION_TOKENS}")

        completion = GroqClient.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3,
            max_completion_tokens=MAX_COMPLETION_TOKENS,
            top_p=0.9,
            stream=True,
            stop=None,
        )

        response = ""
        for chunk in completion:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                response += delta.content

        return response

    elif LLM_Mode == "local":
        return "Local Not Setupped"

    else:
        return ""