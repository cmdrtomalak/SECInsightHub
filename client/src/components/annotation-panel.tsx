import React from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MessageSquare, Plus, Edit, Trash2, X, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Annotation } from "@shared/schema";

interface AnnotationPanelProps {
  documentId: number;
  onOpenAnnotationModal: (annotationToEdit?: Annotation) => void;
  onJumpToAnnotation?: (startOffset: number) => void;
}

export default function AnnotationPanel({ documentId, onOpenAnnotationModal, onJumpToAnnotation }: AnnotationPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedAnnotationForAmend, setSelectedAnnotationForAmend] = useState<Annotation | null>(null);

  const { data: annotations = [], isLoading } = useQuery({
    queryKey: ["/api/documents", documentId, "annotations"],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${documentId}/annotations`);
      console.log("AnnotationPanel: Raw response for annotations, documentId:", documentId, response);
      if (!response.ok) throw new Error("Failed to fetch annotations");
      const annotationsData = await response.json();
      console.log("AnnotationPanel: Parsed annotations for documentId:", documentId, annotationsData);
      return annotationsData;
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

  const getFormattedDate = (createdAt: string | null | undefined) => {
    if (!createdAt) return "Date N/A";
    const date = new Date(createdAt);
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.warn("AnnotationPanel: Invalid date encountered for createdAt:", createdAt);
      return "Invalid Date"; // Or "Date N/A"
    }
    return formatDistanceToNow(date, { addSuffix: true });
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
          annotations.map((annotation: Annotation) => {
            console.log("AnnotationPanel: Rendering annotation in map:", annotation);
            if (
              annotation.selectedText === null || annotation.selectedText === undefined ||
              annotation.note === undefined || // Note can be null, that's fine
              annotation.pageNumber === null || annotation.pageNumber === undefined || isNaN(annotation.pageNumber) ||
              annotation.createdAt === null || annotation.createdAt === undefined ||
              annotation.type === null || annotation.type === undefined ||
              annotation.color === null || annotation.color === undefined
            ) {
              console.warn(
                "AnnotationPanel: Potentially problematic annotation data during render. ID:", annotation.id,
                "selectedText:", annotation.selectedText,
                "note:", annotation.note,
                "pageNumber:", annotation.pageNumber,
                "createdAt:", annotation.createdAt,
                "type:", annotation.type,
                "color:", annotation.color
              );
            }
            return (
            <div
              key={annotation.id}
              className={`${getAnnotationColor(annotation.type, annotation.color || "orange")} cursor-pointer hover:shadow-md transition-shadow relative ${selectedAnnotationForAmend?.id === annotation.id ? 'ring-2 ring-primary ring-offset-1' : ''}`}
              onClick={() => {
                console.log(`[AnnotationPanel] Clicked annotation ID ${annotation.id}, attempting to jump. Global startOffset: ${annotation.startOffset}`);
                onJumpToAnnotation?.(annotation.startOffset);
                setSelectedAnnotationForAmend(annotation);
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium px-2 py-1 rounded ${getTypeColor(annotation.type)}`}>
                  {annotation.type.charAt(0).toUpperCase() + annotation.type.slice(1)}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Page {typeof annotation.pageNumber === 'number' && !isNaN(annotation.pageNumber) ? annotation.pageNumber : "N/A"}
                </span>
              </div>
              
              <p className="text-sm text-foreground mb-2">
                "{annotation.selectedText?.substring(0, 100)}..."
              </p>
              
              {annotation.note && (
                <div className="bg-white rounded p-2 mb-2 border border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-700">{annotation.note}</p>
                  {/* Changed from text-muted-foreground to text-gray-700 */}
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {getFormattedDate(annotation.createdAt)}
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
          )})
        )}
      </div>

      {/* Add New Annotation */}
      <div className="p-4 border-t border-border bg-muted space-y-2">
        {selectedAnnotationForAmend && (
          <Button
            onClick={() => {
              if (selectedAnnotationForAmend) {
                onOpenAnnotationModal(selectedAnnotationForAmend);
              }
            }}
            className="w-full"
            variant="outline"
          >
            <Edit className="w-4 h-4 mr-2" />
            Amend Selected Annotation
          </Button>
        )}
        <Button
          onClick={() => onOpenAnnotationModal()}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Annotation
        </Button>
      </div>
    </div>
  );
}
