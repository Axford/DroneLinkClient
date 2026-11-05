import React, { useState, useEffect } from 'react';
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
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0,
    hasNext: false,
    hasPrev: false
  });
  const location = useLocation();

  const fetchDomains = async (page = 1, limit = 10) => {
    try {
      const response = await fetch(`/api/domains?page=${page}&limit=${limit}`);
      if (!response.ok) {
        throw new Error('Failed to fetch domains');
      }
      const result = await response.json();
      
      // Handle both new and old API response formats
      if (result.success) {
        setDomains(result.data);
        setPagination(result.pagination);
      } else if (Array.isArray(result)) {
        // Old format - just an array of domains
        setDomains(result);
        setPagination({
          page: 1,
          limit: result.length,
          total: result.length,
          pages: 1,
          hasNext: false,
          hasPrev: false
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch domains');
    }
  };

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
        await fetchDomains();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [location.pathname]);

  const handleDomainUpdate = (updatedDomain: Domain) => {
    const domainIndex = domains.findIndex(d => d._id === updatedDomain._id);
    if (domainIndex > -1) {
        // Update existing domain
        const newDomains = [...domains];
        newDomains[domainIndex] = updatedDomain;
        setDomains(newDomains);
    } else {
        // Add new domain and refresh the list
        fetchDomains(pagination.page, pagination.limit);
    }
  };

  const handleDomainDelete = async (domainId: string) => {
    // This will be handled in HomePage with toast notifications
    setDomains(domains.filter(d => d._id !== domainId));
    
    // Update pagination if needed
    if (domains.length === 1 && pagination.page > 1) {
      fetchDomains(pagination.page - 1, pagination.limit);
    }
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
