import { Chrome } from "@/components/Chrome";
import { DocumentsClient } from "./DocumentsClient";
export default function Documents(){return <Chrome><main className="content"><h1>Медицинские документы</h1><p className="muted">Приватное хранилище с выдачей доступа конкретному врачу.</p><DocumentsClient/></main></Chrome>}
