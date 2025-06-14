import { Switch, Route, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import AllDocumentsPage from "@/pages/AllDocumentsPage"; // Import the new page

function Router() {
  return (
    <WouterRouter base="/reader">
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/document/:id" component={Home} />
        <Route path="/all-documents" component={AllDocumentsPage} /> {/* Add new route */}
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
