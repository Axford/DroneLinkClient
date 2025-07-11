// Utility function for making authenticated API calls
// Automatically redirects to /public if user is not authenticated

export const authenticatedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const response = await fetch(url, {
        ...options,
        credentials: 'include', // Ensure cookies are sent
    });

    // If we get a redirect to /public, it means we're not authenticated
    if (response.redirected && response.url.includes('/public')) {
        window.location.href = '/public';
        throw new Error('Authentication required');
    }

    // If we get a 401 or 403, redirect to public
    if (response.status === 401) {
        window.location.href = '/public';
        throw new Error('Authentication required');
    }

    return response;
};

// Helper function for JSON API calls
export const authenticatedFetchJson = async (url: string, options: RequestInit = {}): Promise<any> => {
    const response = await authenticatedFetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(errorData.message || `Request failed with status ${response.status}`);
    }

    return response.json();
};