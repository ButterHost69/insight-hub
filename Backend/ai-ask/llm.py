from groq import Groq

GroqClient: Groq
LLM_Mode: str

def setup_llm(mode:str|None, api_key:str="") -> None:
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

def perform_llm_call(prompt:str)-> str:
    if LLM_Mode == "api":
        completion = GroqClient.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
            {
                "role": "user",
                "content": prompt
            }
            ],
            temperature=1,
            max_completion_tokens=8192,
            top_p=1,
            reasoning_effort="low",
            stream=True,
            stop=None
        )

        response = ""
        for chunk in completion:
            response += chunk.choices[0].delta.content if chunk.choices[0].delta.content else ""
            
        return response

    elif LLM_Mode == "local":
        return "Local Not Setupped"
    
    else:
        return ""