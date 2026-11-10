import useMediaQuery from './useMediaQuery';

export default function useNarrowLayout() {
  return useMediaQuery('(max-width: 767px)');
}
