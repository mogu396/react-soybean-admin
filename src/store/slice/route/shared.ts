import type { ElegantConstRoute } from '@elegant-router/types';

/**
 * Filter auth routes by roles
 *
 * @param routes Auth routes
 * @param roles Roles
 */
export function filterAuthRoutesByRoles(routes: ElegantConstRoute[], roles: string[]) {
  return routes.flatMap(route => filterAuthRouteByRoles(route, roles));
}

/**
 * Filter auth route by roles
 *
 * @param route Auth route
 * @param roles Roles
 */
function filterAuthRouteByRoles(route: ElegantConstRoute, roles: string[]) {
  const routeRoles = (route.meta && route.meta.roles) || [];

  // if the route's "roles" is empty, then it is allowed to access
  const isEmptyRoles = !routeRoles.length;

  // if the user's role is included in the route's "roles", then it is allowed to access
  const hasPermission = routeRoles.some(role => roles.includes(role));

  const filterRoute = { ...route };

  if (filterRoute.children?.length) {
    filterRoute.children = filterRoute.children.flatMap(item => filterAuthRouteByRoles(item, roles));
  }

  return hasPermission || isEmptyRoles ? [filterRoute] : [];
}

/**
 * sort route by order
 *
 * @param route route
 */
function sortRouteByOrder(route: ElegantConstRoute) {
  const sortedRoute = { ...route };
  if (sortedRoute.children?.length) {
    sortedRoute.children = sortedRoute.children.toSorted(
      (next, prev) => (Number(next.meta?.order) || 0) - (Number(prev.meta?.order) || 0)
    );

    sortedRoute.children = sortedRoute.children.map(sortRouteByOrder);
  }

  return sortedRoute;
}

/**
 * sort routes by order
 *
 * @param routes routes
 */
export function sortRoutesByOrder(routes: ElegantConstRoute[]) {
  let sortedRoutes = routes.toSorted((next, prev) => (Number(next.meta?.order) || 0) - (Number(prev.meta?.order) || 0));

  sortedRoutes = sortedRoutes.map(sortRouteByOrder);

  return sortedRoutes;
}
