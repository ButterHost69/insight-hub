from pydantic import BaseModel
from datetime import datetime


class EvalQuestion(BaseModel):
    question: str
    relevant_doc_ids: list[str]
    relevant_doc_titles: list[str]
    ground_truth_answer: str
    difficulty: str = "medium"

class EvalDatasetMetadata(BaseModel):
    created_at: str
    embedding_model: str
    collection: str
    description: str = ""

class EvalDataset(BaseModel):
    metadata: EvalDatasetMetadata
    questions: list[EvalQuestion]