import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";

interface RecentDocumentsProps {
  onDocumentSelect: (documentId: number) => void;
}

export default function RecentDocuments({ onDocumentSelect }: RecentDocumentsProps) {
  const { data: recentDocuments = [], isLoading } = useQuery({
    queryKey: ["/api/documents/recent"],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}api/documents/recent?limit=10`);
      if (!response.ok) throw new Error("Failed to fetch recent documents");
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div>
        <h3 className="font-medium text-sm text-foreground mb-3 flex items-center">
          <Clock className="w-4 h-4 mr-2" />
          Recent Documents
        </h3>
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="font-medium text-sm text-foreground mb-3 flex items-center">
        <Clock className="w-4 h-4 mr-2" />
        Recent Documents
      </h3>
      
      {recentDocuments.length === 0 ? (
        <div className="text-sm text-muted-foreground">No recent documents</div>
      ) : (
        <div className="space-y-2">
          {recentDocuments.map((doc: any) => (
            <div
              key={doc.id}
              className="p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors border border-gray-200"
              onClick={() => onDocumentSelect(doc.id)}
            >
              <div className="text-sm font-medium text-gray-900">
                {doc.companyName} {doc.formType}
              </div>
              <div className="text-xs text-gray-600 font-medium mt-1">
                Filed: {doc.filingDate}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Last accessed: {new Date(doc.lastAccessedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
