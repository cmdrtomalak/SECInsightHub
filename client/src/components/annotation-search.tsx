import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

interface AnnotationSearchProps {
  onAnnotationSelect: (documentId: number, startOffset?: number) => void;
}

export default function AnnotationSearch({ onAnnotationSelect }: AnnotationSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const { data: annotations = [], isLoading } = useQuery({
    queryKey: ["/api/annotations/search", searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      const response = await fetch(`/api/annotations/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) throw new Error("Failed to search annotations");
      return response.json();
    },
    enabled: searchQuery.length >= 2,
  });

  const filteredAnnotations = annotations.filter((annotation: any) => {
    if (activeFilter === "all") return true;
    return annotation.type === activeFilter;
  });

  const getAnnotationColor = (type: string) => {
    switch (type) {
      case "highlight":
        return "text-orange-700 bg-orange-100";
      case "note":
        return "text-pink-700 bg-pink-100";
      case "bookmark":
        return "text-green-700 bg-green-100";
      default:
        return "text-gray-700 bg-gray-100";
    }
  };

  return (
    <div>
      <h3 className="font-medium text-sm text-foreground mb-3 flex items-center">
        <Search className="w-4 h-4 mr-2" />
        Search Annotations
      </h3>
      
      <div className="relative mb-3">
        <Input
          type="text"
          placeholder="Search highlights & notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 text-sm border-2 border-gray-300 focus:border-orange-500 bg-white shadow-sm rounded-md"
        />
        <Search className="absolute left-2.5 top-2.5 h-3 w-3 text-gray-400" />
      </div>

      {/* Annotation Filters */}
      <div className="flex gap-1 mb-3">
        <Button
          size="sm"
          variant={activeFilter === "all" ? "default" : "secondary"}
          className="text-xs px-2 py-1 h-6"
          onClick={() => setActiveFilter("all")}
        >
          All
        </Button>
        <Button
          size="sm"
          variant={activeFilter === "highlight" ? "default" : "secondary"}
          className="text-xs px-2 py-1 h-6 bg-orange-500 hover:bg-orange-600"
          onClick={() => setActiveFilter("highlight")}
        >
          Highlights
        </Button>
        <Button
          size="sm"
          variant={activeFilter === "note" ? "default" : "secondary"}
          className="text-xs px-2 py-1 h-6 bg-pink-500 hover:bg-pink-600"
          onClick={() => setActiveFilter("note")}
        >
          Notes
        </Button>
        <Button
          size="sm"
          variant={activeFilter === "bookmark" ? "default" : "secondary"}
          className="text-xs px-2 py-1 h-6 bg-green-500 hover:bg-green-600"
          onClick={() => setActiveFilter("bookmark")}
        >
          Bookmarks
        </Button>
      </div>

      {/* Annotations List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {isLoading && searchQuery.length >= 2 && (
          <div className="text-xs text-muted-foreground">Searching...</div>
        )}
        
        {searchQuery.length >= 2 && !isLoading && filteredAnnotations.length === 0 && (
          <div className="text-xs text-muted-foreground">No annotations found</div>
        )}

        {filteredAnnotations.map((annotation: any) => (
          <div
            key={annotation.id}
            className="p-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
            onClick={() => onAnnotationSelect(annotation.documentId, annotation.startOffset)}
          >
            <div className="flex items-start justify-between mb-1">
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${getAnnotationColor(annotation.type)}`}>
                {annotation.type.charAt(0).toUpperCase() + annotation.type.slice(1)}
              </span>
              <span className="text-xs text-muted-foreground">
                Page {annotation.pageNumber}
              </span>
            </div>
            <p className="text-xs text-foreground line-clamp-3 mb-1">
              "{annotation.selectedText.substring(0, 100)}..."
            </p>
            {annotation.note && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                {annotation.note}
              </p>
            )}
            <div className="text-xs text-muted-foreground">
              {annotation.documentTitle} • {annotation.companyName}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
