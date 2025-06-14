import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Document } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

// UI Components
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast"; // Corrected path based on typical shadcn/ui structure
import { TopToolbar } from '@/components/TopToolbar';
import { PageContainer } from '@/components/PageContainer';

// Simple debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

const AllDocumentsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [docToDeleteId, setDocToDeleteId] = useState<number | null>(null);

  const { data: documents, isLoading, error } = useQuery<Document[], Error>({
    queryKey: ['/api/documents/all', debouncedSearchQuery], // Query key now includes debounced search
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearchQuery) {
        params.append('q', debouncedSearchQuery);
      }
      return apiRequest.get<Document[]>(`/api/documents/all?${params.toString()}`);
    },
  });

  const deleteMutation = useMutation<void, Error, number>({
    mutationFn: (documentId) => apiRequest.delete(`/api/documents/${documentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents/all'] }); // Invalidate all queries starting with this key
      toast({
        title: "Success",
        description: "Document deleted successfully.",
      });
      setIsConfirmOpen(false);
      setDocToDeleteId(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete document.",
        variant: "destructive",
      });
      setIsConfirmOpen(false);
      setDocToDeleteId(null);
    },
  });

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const openConfirmDialog = (documentId: number) => {
    setDocToDeleteId(documentId);
    setIsConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (docToDeleteId !== null) {
      deleteMutation.mutate(docToDeleteId);
    }
  };

  return (
    <PageContainer>
      <TopToolbar>
        <h1 className="text-xl font-semibold">All Documents</h1>
      </TopToolbar>
      <div className="p-4 space-y-4">
        <Input
          type="text"
          placeholder="Search documents by title..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="max-w-sm"
        />

        {isLoading && <p>Loading documents...</p>}
        {error && <p className="text-red-500">Error fetching documents: {error.message}</p>}

        {!isLoading && !error && documents && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Form Type</TableHead>
                <TableHead>Filing Date</TableHead>
                <TableHead>Report Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">
                    {debouncedSearchQuery ? "No documents found matching your search." : "No documents found."}
                  </TableCell>
                </TableRow>
              )}
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">{doc.title}</TableCell>
                  <TableCell>{doc.formType}</TableCell>
                  <TableCell>{new Date(doc.filingDate).toLocaleDateString()}</TableCell>
                  <TableCell>{doc.reportDate ? new Date(doc.reportDate).toLocaleDateString() : 'N/A'}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openConfirmDialog(doc.id)}
                      disabled={deleteMutation.isPending && deleteMutation.variables === doc.id}
                    >
                      {deleteMutation.isPending && deleteMutation.variables === doc.id ? "Deleting..." : "Delete"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the document
              and all associated data (like annotations and chunks).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsConfirmOpen(false)} disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Confirm Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
};

export default AllDocumentsPage;
