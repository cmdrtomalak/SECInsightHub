import React from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MessageSquare, Plus, Edit, Trash2, X, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface AnnotationPanelProps {
  documentId: number;
  onOpenAnnotationModal: () => void;
  onJumpToAnnotation?: (startOffset: number) => void;
}

export default function AnnotationPanel({ documentId, onOpenAnnotationModal, onJumpToAnnotation }: AnnotationPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const { data: annotations = [], isLoading } = useQuery({
    queryKey: ["/api/documents", documentId, "annotations"],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${documentId}/annotations`);
      if (!response.ok) throw new Error("Failed to fetch annotations");
      return response.json();
    },
  });

  const deleteAnnotationMutation = useMutation({
    mutationFn: async (annotationId: number) => {
      await apiRequest("DELETE", `/api/annotations/${annotationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", documentId, "annotations"] });
      toast({
        title: "Annotation deleted",
        description: "The annotation has been removed from the document.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete annotation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getAnnotationColor = (type: string, color: string) => {
    const baseClasses = "border rounded-lg p-3";
    
    switch (type) {
      case "highlight":
        switch (color) {
          case 'orange':
            return `${baseClasses} bg-orange-50 border-orange-200`;
          case 'green':
            return `${baseClasses} bg-green-50 border-green-200`;
          case 'pink':
            return `${baseClasses} bg-pink-50 border-pink-200`;
          case 'blue':
            return `${baseClasses} bg-blue-50 border-blue-200`;
          default: // Fallback if color is somehow undefined or unexpected for a highlight
            return `${baseClasses} bg-orange-50 border-orange-200`;
        }
      case "note":
        return `${baseClasses} bg-gray-50 border-gray-200`; // Neutral styling for notes
      case "bookmark":
        return `${baseClasses} bg-green-50 border-green-200`;
      default:
        return `${baseClasses} bg-gray-50 border-gray-200`;
    }
  };

  const getTypeColor = (type: string) => {
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

  if (isCollapsed) {
    return (
      <div className="w-12 bg-surface border-l border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(false)}
            className="w-6 h-6 p-0"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-80 bg-surface border-l border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground flex items-center">
              <MessageSquare className="w-4 h-4 mr-2" />
              Document Annotations
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCollapsed(true)}
              className="w-6 h-6 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading annotations...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-surface border-l border-border flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-foreground flex items-center">
            <MessageSquare className="w-4 h-4 mr-2" />
            Document Annotations
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(true)}
            className="w-6 h-6 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {annotations.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No annotations yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Select text to add highlights or notes
            </p>
          </div>
        ) : (
          annotations.map((annotation: any) => (
            <div 
              key={annotation.id} 
              className={`${getAnnotationColor(annotation.type, annotation.color)} cursor-pointer hover:shadow-md transition-shadow`}
              onClick={() => onJumpToAnnotation?.(annotation.startOffset)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium px-2 py-1 rounded ${getTypeColor(annotation.type)}`}>
                  {annotation.type.charAt(0).toUpperCase() + annotation.type.slice(1)}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Page {annotation.pageNumber}
                </span>
              </div>
              
              <p className="text-sm text-foreground mb-2">
                "{annotation.selectedText.substring(0, 100)}..."
              </p>
              
              {annotation.note && (
                <div className="bg-white rounded p-2 mb-2 border border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-muted-foreground">{annotation.note}</p>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {formatDistanceToNow(new Date(annotation.createdAt), { addSuffix: true })}
                </span>
                <div className="flex space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteAnnotationMutation.mutate(annotation.id);
                    }}
                    disabled={deleteAnnotationMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add New Annotation */}
      <div className="p-4 border-t border-border bg-muted">
        <Button
          onClick={onOpenAnnotationModal}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Annotation
        </Button>
      </div>
    </div>
  );
}
