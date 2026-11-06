import React, { useState, useEffect, useCallback } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Container, Spinner, Alert } from 'react-bootstrap';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import HomePage from './HomePage';
import InvitePage from './InvitePage';
import DomainDetailPage from './DomainDetailPage';
import { ToastProvider } from './contexts/ToastContext';
import './App.css';

// Interfaces
export interface User {
  _id: string;
  displayName: string;
  email: string;
  profilePicture: string;
  lastSignInDate: string;
  domains: string[];
  mapState?: {
    lng: number;
    lat: number;
    zoom: number;
  };
}

export interface Domain {
    _id: string;
    name: string;
    apiKey?: string;
    inviteToken?: string;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: {
        _id: string;
        displayName: string;
        email: string;
    } | null;
    users?: {
        _id: string;
        displayName: string;
        email: string;
        profilePicture?: string;
    }[];
    stats?: {
        nodeCount: number;
        packetCount: number;
    };
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pagination, setPagination] = useState<{ limit: number; nextCursor: string | null; hasPrev: boolean }>({ limit: 10, nextCursor: null, hasPrev: false });
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const location = useLocation();

  const loadPage = useCallback(async (stack: Array<string | undefined>) => {
    const cursor = stack[stack.length - 1];
    try {
      const response = await fetch(`/api/domains?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (!response.ok) throw new Error('Failed to fetch domains');
      const result = await response.json();
      setDomains(result.data);
      setCursorStack(stack);
      setPagination({ limit: 10, nextCursor: result.pagination.nextCursor, hasPrev: stack.length > 1 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch domains');
    }
  }, []);
  const fetchDomains = (direction: 'next' | 'previous' | 'reset' = 'reset') => loadPage(direction === 'reset' ? [undefined] : direction === 'previous' ? cursorStack.slice(0, -1) : [...cursorStack, pagination.nextCursor || undefined]);

  useEffect(() => {
    // Skip data fetching for invite pages
    if (location.pathname.startsWith('/invite/')) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const userResponse = await fetch('/api/user');
        if (!userResponse.ok) {
          throw new Error('Failed to fetch user data');
        }
        const userData = await userResponse.json();
        setUser(userData);
        
        // Fetch domains after user is loaded
        await loadPage([undefined]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [location.pathname, loadPage]);

  const handleDomainUpdate = (updatedDomain: Domain) => {
    const domainIndex = domains.findIndex(d => d._id === updatedDomain._id);
    if (domainIndex > -1) {
        // Update existing domain
        const newDomains = [...domains];
        newDomains[domainIndex] = updatedDomain;
        setDomains(newDomains);
    } else {
        // Add new domain and refresh the list
        fetchDomains();
    }
  };

  const handleDomainDelete = async (domainId: string) => {
    // This will be handled in HomePage with toast notifications
    setDomains(domains.filter(d => d._id !== domainId));
    
    await fetchDomains();
  };

  if (loading) {
    return (
      <Container fluid className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mt-5">
        <Alert variant="danger">
          <Alert.Heading>Error</Alert.Heading>
          <p>{error}</p>
        </Alert>
      </Container>
    );
  }

  // Handle invite pages separately
  if (location.pathname.startsWith('/invite/')) {
    return <InvitePage />;
  }

  // Handle domain detail pages separately
  if (location.pathname.startsWith('/private/domain/')) {
    return <DomainDetailPage />;
  }

  if (loading) {
    return (
      <Container fluid className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mt-5">
        <Alert variant="danger">
          <Alert.Heading>Error</Alert.Heading>
          <p>{error}</p>
        </Alert>
      </Container>
    );
  }

  return (
    user && (
      <div className="d-flex">
        <Sidebar 
          user={user} 
          isCollapsed={isSidebarCollapsed} 
          toggleSidebar={() => setSidebarCollapsed(!isSidebarCollapsed)} 
        />
        <main className="content-wrapper">
          <HomePage 
            domains={domains} 
            onDomainUpdate={handleDomainUpdate}
            onDomainDelete={handleDomainDelete}
            pagination={pagination}
            onPageChange={fetchDomains}
            loading={loading}
          />
        </main>
      </div>
    )
  );
}

function App() {
  return (
    <ToastProvider>
      <Router>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/private/domain/:domainId" element={<DomainDetailPage />} />
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </Router>
    </ToastProvider>
  );
}

export default App;
