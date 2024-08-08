import type { ElegantConstRoute } from '@ohh-889/react-auto-route';
import type { Location } from 'react-router-dom';
import type { RouteLocationNamedRaw } from '../types';
import type { RouteRecordRaw } from './types';
import { createRouteRecordMatcher } from './pathMatcher';
import { generatePath, getQueryParams, mergeMetaFields, normalizeRouteRecord, objectToQueryParams } from './shared';

class CreateRouterMatcher {
  // Internal routes maintained for react-router
  matchers: RouteRecordRaw[] = [];

  matcherMap = new Map<string, RouteRecordRaw>();

  initRoutes: ElegantConstRoute[] = [];

  constructor(routes: ElegantConstRoute[]) {
    this.initRoutes = routes;
    this.initializeRoutes();
    this.removeRoute = this.removeRoute.bind(this);
  }
  /** - Initializes the routes by adding each route from the initial routes array. */
  initializeRoutes() {
    this.initRoutes.forEach(route => this.addRoute(route));
  }

  /**
   * -Removes a route from the matcherMap by its name.
   *
   * @param name - The name of the route to remove.
   */
  removeMatcherMapByName(name: string) {
    this.matcherMap.delete(name);
  }

  addRoute(record: ElegantConstRoute, parent?: RouteRecordRaw, originalRecord?: RouteRecordRaw) {
    // used later on to remove by name
    const isRootAdd = !originalRecord;
    const mainNormalizedRecord = normalizeRouteRecord(record);
    // if (process.env.NODE_ENV === 'development') {
    //   checkChildMissingNameWithEmptyPath(mainNormalizedRecord, parent);
    // }

    // generate an array of records to correctly handle aliases
    const normalizedRecords: (typeof mainNormalizedRecord)[] = [mainNormalizedRecord];

    let matcher: RouteRecordRaw;

    for (const normalizedRecord of normalizedRecords) {
      const { path } = normalizedRecord;
      // Build up the path for nested routes if the child isn't an absolute
      // route. Only add the / delimiter if the child path isn't empty and if the
      // parent path doesn't have a trailing slash
      if (parent && path && path[0] !== '/') {
        const parentPath = parent.record.path as string;
        const connectingSlash = parentPath[parentPath.length - 1] === '/' ? '' : '/';
        normalizedRecord.path = parent.record.path + (path && connectingSlash + path);
      }

      // create the object beforehand, so it can be passed to children
      matcher = createRouteRecordMatcher(normalizedRecord, parent);

      // remove the route if named and only for the top record (avoid in nested calls)
      // this works because the original record is the first one
      if (isRootAdd && record.name) {
        this.removeRoute(record.name);
      }

      if (mainNormalizedRecord.children) {
        const children = mainNormalizedRecord.children;

        // eslint-disable-next-line no-plusplus
        for (let i = 0; i < children.length; i++) {
          const childOriginalRecord = originalRecord && originalRecord.children[i];
          this.addRoute(children[i], matcher, childOriginalRecord);
        }
      }

      // Avoid adding a record that doesn't display anything. This allows passing through records without a component to
      // not be reached and pass through the catch all route

      if ((matcher.record.component && Object.keys(matcher.record.component).length) || matcher.record.name) {
        this.insertMatcher(matcher);
      }
    }
  }

  /**
   * Removes a route from the matchers and matcherMap. If the route has children, it recursively removes them as well.
   *
   * @param matcherRef - The route reference, which can be a name or a matcher object.
   */
  removeRoute(matcherRef: string | RouteRecordRaw) {
    if (typeof matcherRef === 'string') {
      const matcher = this.matcherMap.get(matcherRef);
      if (matcher) {
        this.removeMatcherMapByName(matcherRef);
        this.matchers.splice(this.matchers.indexOf(matcher), 1);

        matcher.children.forEach(this.removeRoute);
      }
    } else {
      const index = this.matchers.indexOf(matcherRef);
      if (index > -1) {
        this.matchers.splice(index, 1);
        if (matcherRef.record.name) this.removeMatcherMapByName(matcherRef.record.name);
        matcherRef.children.forEach(this.removeRoute);
      }
    }
  }

  /**
   * Gets a matcher object by its name.
   *
   * @param name - The name of the route to get.
   * @returns The matcher object corresponding to the name, or undefined if not found.
   */
  getRecordMatcher(name: string) {
    return this.matcherMap.get(name);
  }
  resolve(location: RouteLocationNamedRaw | Location, currentLocation: RouteLocationNamedRaw) {
    let matcher: RouteRecordRaw | undefined;
    let query: Record<string, any> = {};
    let path: string = '';
    let name: string | undefined;
    let fullPath: string = '';
    let component: string | undefined;

    if ('name' in location) {
      matcher = this.matcherMap.get(location.name);

      if (!matcher) {
        throw new Error('没有此路由');
      }

      name = matcher.record.name;
      if ('params' in location) {
        const params = location.params || {};
        const cleanedParams: { [key: string]: string | number } = {};

        // eslint-disable-next-line guard-for-in
        for (const key in params) {
          const value = params[key];
          if (typeof value === 'string' || typeof value === 'number') {
            cleanedParams[key] = value;
          } else if (Array.isArray(value)) {
            // 如果需要支持数组，可以将其转换为字符串
            cleanedParams[key] = value.join(',');
          }
        }

        fullPath = generatePath(matcher.record.path, cleanedParams);
      } else {
        fullPath = matcher.record.path;
      }
      if ('query' in location) {
        query = location.query || {};

        const queryParams = objectToQueryParams(query);

        fullPath += queryParams ? `?${queryParams}` : '';
      }
      // throws if cannot be stringified
      path = matcher.record.path;
      component = matcher.record.component;
    } else if (location.pathname !== null) {
      // no need to resolve the path with the matcher as it was provided
      // this also allows the user to control the encoding
      path = location.pathname;

      matcher = this.matchers.find(m => m.record.path === path);
      // matcher should have a value after the loop
      query = getQueryParams(location.search);
      if (matcher) {
        // we know the matcher works because we tested the regexp

        name = matcher.record.name;
        fullPath = location.pathname + location.search;
        component = matcher.record.component;
      }
      // location is a relative path
    } else {
      // match by name or path of current route
      matcher = currentLocation.name
        ? this.matcherMap.get(currentLocation.name)
        : this.matchers.find(m => m.record === (currentLocation.path as unknown));
      if (!matcher) {
        throw new Error('没有此理由');
      }

      name = matcher.record.name;
    }
    const matched = [];
    let parentMatcher = matcher;
    while (parentMatcher) {
      // reversed order so parents are at the beginning
      matched.unshift(parentMatcher.record);
      parentMatcher = parentMatcher.parent;
    }
    return {
      fullPath,
      name,
      path,
      hash: location.hash,
      component,
      matched,
      query,
      meta: mergeMetaFields(matched)
    };
  }

  /**
   * Gets all the route names currently in the matcherMap.
   *
   * @returns An array of route names.
   */
  getAllRouteNames() {
    const names = Array.from(this.matcherMap.keys());
    return names;
  }

  /**
   * Inserts a new matcher into the matchers array and matcherMap.
   *
   * @param matcher - The matcher object to insert.
   */
  insertMatcher(matcher: RouteRecordRaw) {
    this.matchers.push(matcher);
    // only add the original record to the name map
    if (matcher.record.name) this.matcherMap.set(matcher.record.name, matcher);
  }

  /**
   * Gets all the routes currently in the matchers array.
   *
   * @returns An array of matcher objects.
   */
  getRoutes() {
    return this.matchers;
  }

  /** - Resets the matchers array and matcherMap, then re-initializes the routes. */
  resetMatcher() {
    this.matchers.length = 0;
    this.matcherMap.clear();
    this.initializeRoutes();
  }
}

export default CreateRouterMatcher;
