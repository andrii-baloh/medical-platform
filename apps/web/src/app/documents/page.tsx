import { Chrome } from "@/components/Chrome";
import { DocumentsClient } from "./DocumentsClient";

export default function DocumentsPage() {
  return (
    <Chrome>
      <main className="content documents-page">
        <div className="page-heading compact-heading"><span className="eyebrow">Документы</span><h1>Медицинские файлы</h1><p>Приватное хранилище ваших результатов, заключений и обследований.</p></div>
        <DocumentsClient />
      </main>
    </Chrome>
  );
}
