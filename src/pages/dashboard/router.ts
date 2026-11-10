import { useEffect, useState } from 'react';

export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path = '/', qs = ''] = raw.split('?');
  return { path, segments: path.split('/').filter(Boolean), query: new URLSearchParams(qs) };
}

/** Minimal hash router (extension pages can't use history routing reliably). */
export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string): void {
  location.hash = path.startsWith('/') ? path : `/${path}`;
}
