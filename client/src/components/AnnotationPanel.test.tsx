import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AnnotationPanel from './annotation-panel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
// DO NOT import formatDistanceToNow from 'date-fns' here when using jest.mock for it in this way

// Mock necessary props and hooks
jest.mock('@tanstack/react-query');
jest.mock('@/hooks/use-toast');
jest.mock('lucide-react', () => ({
  ...jest.requireActual('lucide-react'),
  MessageSquare: ({ className }: { className?: string }) => <svg data-testid="MessageSquare" className={className} />,
  Plus: ({ className }: { className?: string }) => <svg data-testid="Plus" className={className} />,
  Edit: ({ className }: { className?: string }) => <svg data-testid="Edit" className={className} />,
  Trash2: ({ className }: { className?: string }) => <svg data-testid="Trash2" className={className} />,
  X: ({ className }: { className?: string }) => <svg data-testid="X" className={className} />,
  ChevronRight: ({ className }: { className?: string }) => <svg data-testid="ChevronRight" className={className} />,
}));
// Mock date-fns
jest.mock('date-fns', () => {
  const originalDateFns = jest.requireActual('date-fns');
  return {
    ...originalDateFns,
    formatDistanceToNow: jest.fn((date: Date | number, options?: any) => {
      // This mock implementation will be further customized in beforeEach
      // For a default, or if you want the real behavior wrapped:
      // return `mocked ${originalDateFns.formatDistanceToNow(new Date(date), options)}`;
      return `Initial mock for ${new Date(date).toISOString()}`;
    }),
  };
});


describe('AnnotationPanel', () => {
  const mockProps = {
    documentId: 1,
    onOpenAnnotationModal: jest.fn(),
    onJumpToAnnotation: jest.fn(),
  };

  const mockAnnotations = [
    {
      id: 101,
      documentId: 1,
      type: 'highlight',
      selectedText: 'This is a test highlight.',
      note: 'A small note here.',
      color: 'orange',
      pageNumber: 1,
      startOffset: 0,
      endOffset: 25,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 102,
      documentId: 1,
      type: 'note',
      selectedText: 'Another piece of text.',
      note: 'A different note for note type.',
      color: 'blue', // Notes don't use color in the same way, but good to have
      pageNumber: 2,
      startOffset: 30,
      endOffset: 50,
      createdAt: new Date(new Date().getTime() - 1000 * 60 * 5).toISOString(), // 5 mins ago
      updatedAt: new Date().toISOString(),
    },
  ];

  let mockMutate: jest.Mock;
  let mockInvalidateQueries: jest.Mock;
  let mockToastFn: jest.Mock;

  beforeEach(() => {
    mockMutate = jest.fn();
    mockInvalidateQueries = jest.fn();
    mockToastFn = jest.fn();

    (useQuery as jest.Mock).mockReturnValue({ data: [], isLoading: false, error: null });
    (useMutation as jest.Mock).mockReturnValue({ mutate: mockMutate, isPending: false });
    (useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries: mockInvalidateQueries });
    (useToast as jest.Mock).mockReturnValue({ toast: mockToastFn });

    // Now that formatDistanceToNow is properly mocked via jest.mock,
    // we can grab it from the mocked 'date-fns' module to further refine its implementation for tests.
    // This requires an import of the mocked function.
    // To do this cleanly, we typically import the specific function we are mocking.
    // Since we've removed the top-level import, we need to ensure it's available.
    // The jest.mock factory itself can return the mocked function.
    // Or, we can import it and TypeScript should pick up the mocked version.
    // Let's re-add the import, it should now refer to the mock.
    const { formatDistanceToNow: mockedFormatDistanceToNow } = require('date-fns');
    (mockedFormatDistanceToNow as jest.Mock).mockImplementation((date: Date | number, options?: any) => {
        const originalDateFns = jest.requireActual('date-fns');
        return `mocked ${originalDateFns.formatDistanceToNow(new Date(date), { addSuffix: true, ...options })}`;
    });
  });

  it('renders without crashing when no annotations', () => {
    render(<AnnotationPanel {...mockProps} />);
    expect(screen.getByText(/Document Annotations/i)).toBeInTheDocument();
    expect(screen.getByText(/No annotations yet/i)).toBeInTheDocument();
  });

  describe('with annotations', () => {
    beforeEach(() => {
      (useQuery as jest.Mock).mockReturnValue({ data: mockAnnotations, isLoading: false, error: null });
    });

    it('renders annotations correctly and checks UI distinctness', () => {
      render(<AnnotationPanel {...mockProps} />);

      // Verify first annotation
      const firstAnnotation = mockAnnotations[0];
      expect(screen.getByText(new RegExp(firstAnnotation.selectedText.substring(0, 10), 'i'))).toBeInTheDocument();
      expect(screen.getByText(firstAnnotation.note!)).toBeInTheDocument();
      expect(screen.getByText(`Page ${firstAnnotation.pageNumber}`)).toBeInTheDocument();
      // Use the same logic as in beforeEach for consistency in expected string
      const expectedDateString = `mocked ${jest.requireActual('date-fns').formatDistanceToNow(new Date(firstAnnotation.createdAt), { addSuffix: true })}`;
      expect(screen.getByText(expectedDateString)).toBeInTheDocument();

      const deleteButtons = screen.getAllByTestId('Trash2');
      expect(deleteButtons.length).toBe(mockAnnotations.length);
      const firstDeleteButtonContainer = deleteButtons[0].closest('button');
      expect(firstDeleteButtonContainer).toBeInTheDocument();

      // UI distinctness checks for the first annotation
      // Delete button
      expect(firstDeleteButtonContainer).toHaveClass('hover:bg-gray-200', 'rounded'); // Assuming dark mode is not default for test env

      // Annotation note
      const noteDiv = screen.getByText(firstAnnotation.note!).parentElement;
      expect(noteDiv).toHaveClass('border', 'border-gray-200');

      // Timestamp
      const timestampSpan = screen.getByText(expectedDateString);
      expect(timestampSpan).toHaveClass('text-gray-600'); // Or dark:text-gray-400

      // Verify second annotation to be sure mapping works
      const secondAnnotation = mockAnnotations[1];
      expect(screen.getByText(new RegExp(secondAnnotation.selectedText.substring(0, 10), 'i'))).toBeInTheDocument();
      expect(screen.getByText(secondAnnotation.note!)).toBeInTheDocument();
    });

    it('delete button triggers mutation', () => {
      render(<AnnotationPanel {...mockProps} />);
      const deleteButtons = screen.getAllByTestId('Trash2');
      fireEvent.click(deleteButtons[0].closest('button')!);
      expect(mockMutate).toHaveBeenCalledWith(mockAnnotations[0].id);
    });

    it('successful deletion shows toast and invalidates queries', () => {
      // Override useMutation mock for this specific test to control onSuccess
      (useMutation as jest.Mock).mockImplementation(({ onSuccess }: { onSuccess?: () => void }) => ({
        mutate: (id: number) => {
          mockMutate(id);
          if (onSuccess) onSuccess(); // Call onSuccess if provided
        },
        isPending: false,
      }));

      render(<AnnotationPanel {...mockProps} />);
      const deleteButtons = screen.getAllByTestId('Trash2');
      fireEvent.click(deleteButtons[0].closest('button')!);

      expect(mockMutate).toHaveBeenCalledWith(mockAnnotations[0].id);
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["/api/documents", mockProps.documentId, "annotations"] });
      expect(mockToastFn).toHaveBeenCalledWith(expect.objectContaining({
        title: "Annotation deleted",
        description: "The annotation has been removed from the document.",
      }));
    });

    it('failed deletion shows error toast', () => {
      // Override useMutation mock for this specific test to control onError
      (useMutation as jest.Mock).mockImplementation(({ onError }: { onError?: () => void }) => ({
        mutate: (id: number) => {
          mockMutate(id);
          if (onError) onError(); // Call onError if provided
        },
        isPending: false,
      }));
      render(<AnnotationPanel {...mockProps} />);
      const deleteButtons = screen.getAllByTestId('Trash2');
      fireEvent.click(deleteButtons[0].closest('button')!);

      expect(mockMutate).toHaveBeenCalledWith(mockAnnotations[0].id);
      expect(mockToastFn).toHaveBeenCalledWith(expect.objectContaining({
        title: "Error",
        description: "Failed to delete annotation. Please try again.",
        variant: "destructive",
      }));
    });
  });
});
