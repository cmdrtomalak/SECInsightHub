import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AnnotationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedText: string;
  documentId: number | null;
  selectionRange: {
    startOffset: number;
    endOffset: number;
  } | null;
}

export default function AnnotationModal({
  open,
  onOpenChange,
  selectedText,
  documentId,
  selectionRange,
}: AnnotationModalProps) {
  const [annotationType, setAnnotationType] = useState<"highlight" | "note" | "bookmark">("highlight");
  const [note, setNote] = useState("");
  const [color, setColor] = useState("orange");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createAnnotationMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/annotations", data);
    },
    onSuccess: () => {
      if (documentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/documents", documentId, "annotations"] });
      }
      toast({
        title: "Annotation created",
        description: "Your annotation has been saved to the document.",
      });
      handleClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create annotation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!documentId || !selectionRange || !selectedText.trim()) {
      toast({
        title: "Error",
        description: "Please select some text first.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      documentId,
      type: annotationType,
      selectedText: selectedText.trim(),
      note: annotationType === 'note' ? note.trim() : (note.trim() || null),
      color: annotationType === 'highlight' ? color : 'orange', // If highlight, use selected color, else default to orange
      pageNumber: 1, // TODO: Calculate actual page number
      startOffset: selectionRange.startOffset,
      endOffset: selectionRange.endOffset,
    };

    createAnnotationMutation.mutate(payload);
  };

  const handleClose = () => {
    setNote("");
    setAnnotationType("highlight");
    setColor("orange");
    onOpenChange(false);
  };

  const getTypeButtonClass = (type: string) => {
    const baseClass = "px-3 py-2 text-sm rounded transition-colors";
    switch (type) {
      case "highlight":
        return annotationType === type
          ? `${baseClass} bg-orange-500 text-white`
          : `${baseClass} bg-muted text-muted-foreground hover:bg-orange-100`;
      case "note":
        return annotationType === type
          ? `${baseClass} bg-pink-500 text-white`
          : `${baseClass} bg-muted text-muted-foreground hover:bg-pink-100`;
      case "bookmark":
        return annotationType === type
          ? `${baseClass} bg-green-500 text-white`
          : `${baseClass} bg-muted text-muted-foreground hover:bg-green-100`;
      default:
        return `${baseClass} bg-muted text-muted-foreground`;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Annotation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium text-foreground">Selected Text</Label>
            <div className="mt-2 p-3 bg-muted rounded border text-sm">
              {selectedText || "No text selected"}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium text-foreground">Annotation Type</Label>
            <div className="mt-2 flex space-x-2">
              <button
                className={getTypeButtonClass("highlight")}
                onClick={() => setAnnotationType("highlight")}
              >
                Highlight
              </button>
              <button
                className={getTypeButtonClass("note")}
                onClick={() => {
                  setAnnotationType("note");
                  setColor("orange"); // Default color for notes as per schema
                }}
              >
                Note
              </button>
              <button
                className={getTypeButtonClass("bookmark")}
                onClick={() => setAnnotationType("bookmark")}
              >
                Bookmark
              </button>
            </div>
          </div>

          {annotationType === "highlight" && (
            <div>
              <Label className="text-sm font-medium text-foreground">Highlight Color</Label>
              <div className="mt-2 flex space-x-2">
                {["orange", "green", "pink", "blue"].map((colorOption) => (
                  <button
                    key={colorOption}
                    className={`w-8 h-8 rounded border-2 ${
                      color === colorOption ? "border-foreground" : "border-border"
                    }`}
                    style={{
                      backgroundColor: 
                        colorOption === "orange" ? "#fed7aa" :
                        colorOption === "green" ? "#bbf7d0" :
                        colorOption === "pink" ? "#fce7f3" :
                        "#dbeafe"
                    }}
                    onClick={() => setColor(colorOption)}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-sm font-medium text-foreground">
              Note {annotationType !== "note" && "(Optional)"}
            </Label>
            <Textarea
              className="mt-2 resize-none"
              rows={3}
              placeholder="Add your note here..."
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
              }}
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <Button
              onClick={handleSubmit}
              disabled={createAnnotationMutation.isPending || !selectedText.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              {createAnnotationMutation.isPending ? "Saving..." : "Save Annotation"}
            </Button>
            <Button variant="outline" onClick={handleClose} className="border-gray-300 text-gray-700 hover:bg-gray-50">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
