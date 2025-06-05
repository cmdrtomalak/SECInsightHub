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
import type { Annotation } from "@shared/schema"; // Added Annotation type
import { useEffect } from "react"; // Added useEffect

interface AnnotationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<Annotation>, idToUpdate?: number) => void; // Modified onSave
  selectedText: string; // Keep for new annotations
  documentId: number | null; // Keep for new annotations
  selectionRange: { // Keep for new annotations
    startOffset: number;
    endOffset: number;
  } | null;
  annotationToEdit?: Annotation | null; // Added annotationToEdit
}

export default function AnnotationModal({
  open,
  onOpenChange,
  onSave, // Added onSave
  selectedText: initialSelectedText, // Renamed for clarity with annotationToEdit
  documentId,
  selectionRange,
  annotationToEdit, // Added annotationToEdit
}: AnnotationModalProps) {
  const [annotationType, setAnnotationType] = useState<Annotation['type']>("highlight");
  const [note, setNote] = useState("");
  const [color, setColor] = useState<Annotation['color']>("orange");
  const [currentSelectedText, setCurrentSelectedText] = useState(initialSelectedText); // For display

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Effect to initialize/reset form when annotationToEdit or open status changes
  useEffect(() => {
    if (open) {
      if (annotationToEdit) {
        setNote(annotationToEdit.note || "");
        setAnnotationType(annotationToEdit.type);
        setColor(annotationToEdit.color || "orange"); // Default if color is null
        setCurrentSelectedText(annotationToEdit.selectedText);
      } else {
        setNote("");
        setAnnotationType("highlight");
        setColor("orange");
        setCurrentSelectedText(initialSelectedText);
      }
    }
  }, [annotationToEdit, open, initialSelectedText]);

  // This existing mutation is for direct API call from modal.
  // It will be bypassed by calling onSave prop instead.
  // Consider removing if onSave handles all mutation logic externally.
  const internalMutationHook = useMutation({ // Renamed to avoid confusion
    mutationFn: async (data: any) => { /* ... existing mutationFn ... */ },
    onSuccess: () => { /* ... existing onSuccess ... */ },
    onError: () => { /* ... existing onError ... */ },
  });


  const handleSubmit = () => {
    if (annotationToEdit) {
      // Update existing annotation
      const dataToSave: Partial<Annotation> = {
        note: note.trim(),
        type: annotationType,
        color: annotationType === 'highlight' ? color : (annotationToEdit.type === 'highlight' ? annotationToEdit.color : 'orange'), // Preserve original highlight color if type not changed from highlight
      };
      onSave(dataToSave, annotationToEdit.id);
    } else {
      // Create new annotation
      if (!documentId || !selectionRange || !currentSelectedText.trim()) {
        toast({
          title: "Error",
          description: "Cannot create annotation. Missing document context or selected text.",
          variant: "destructive",
        });
        return;
      }
      const dataToSave: Partial<Annotation> = {
        documentId,
        type: annotationType,
        selectedText: currentSelectedText.trim(),
        note: annotationType === 'note' ? note.trim() : (note.trim() || null),
        color: annotationType === 'highlight' ? color : 'orange',
        pageNumber: 1, // TODO: Needs to be properly determined
        startOffset: selectionRange.startOffset,
        endOffset: selectionRange.endOffset,
      };
      onSave(dataToSave);
    }
    handleClose(); // Close modal after save attempt
  };

  const handleClose = () => {
    // Reset state for 'new' annotation scenario, useEffect will handle for 'edit' if re-opened
    if (!annotationToEdit) {
        setNote("");
        setAnnotationType("highlight");
        setColor("orange");
        setCurrentSelectedText(""); // Reset selected text if it was for a new one
    }
    onOpenChange(false);
  };

  const getTypeButtonClass = (type: Annotation['type']) => {
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

  const isEditing = !!annotationToEdit;
  const modalTitle = isEditing ? "Edit Annotation" : "Add Annotation";
  const saveButtonText = isEditing ? "Update Annotation" : "Save Annotation";

  return (
    <Dialog open={open} onOpenChange={handleClose}> {/* Ensure handleClose is used for onOpenChange */}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{modalTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium text-foreground">Selected Text</Label>
            <div className="mt-2 p-3 bg-muted rounded border text-sm max-h-20 overflow-y-auto">
              {currentSelectedText || "No text selected"}
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
            <Label htmlFor="annotation-note-textarea" className="text-sm font-medium text-foreground">
              Note {annotationType !== "note" && "(Optional)"}
            </Label>
            <Textarea
              id="annotation-note-textarea"
              className="mt-2 resize-none text-foreground" // Added text-foreground
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
              // Disable button if trying to create new but no text, or if internal hook is pending (if used)
              disabled={(isEditing ? false : !currentSelectedText.trim()) || internalMutationHook.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              {internalMutationHook.isPending ? "Saving..." : saveButtonText}
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
