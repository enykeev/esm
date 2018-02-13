import Package from "../../package.js"

import _resolveFilename from "./_resolve-filename.js"
import decodeURIComponent from "../../util/decode-uri-component.js"
import errors from "../../errors.js"
import extname from "../../path/extname.js"
import getFilePathFromURL from "../../util/get-file-path-from-url.js"
import getModuleDirname from "../../util/get-module-dirname.js"
import getModuleName from "../../util/get-module-name.js"
import hasEncodedSlash from "../../util/has-encoded-slash.js"
import isAbsolutePath from "../../util/is-absolute-path.js"
import isObject from "../../util/is-object.js"
import isRelativePath from "../../util/is-relative-path.js"
import parseURL from "../../util/parse-url.js"
import shared from "../../shared.js"

const localhostRegExp = /^\/\/localhost\b/
const queryHashRegExp = /[?#].*$/

const esmExts = [".mjs", ".js", ".json", ".node"]
const gzExts = esmExts.concat(".gz", ".mjs.gz", ".js.gz")
const noExts = []

const esmExtsLookup = { __proto__: null }
const gzExtsLookup = { __proto__: null }

for (const ext of esmExts) {
  esmExtsLookup[ext] = true
}

for (const ext of gzExts) {
  gzExtsLookup[ext] = true
}

function resolveFilename(request, parent, isMain, options) {
  if (typeof request !== "string") {
    throw new errors.TypeError("ERR_INVALID_ARG_TYPE", "request", "string")
  }

  const cache = shared.resolveFilename
  const cacheKey = isObject(options)
    ? null
    : request + "\0" + getModuleName(parent) + "\0" + isMain

  if (cacheKey &&
      cacheKey in cache) {
    return cache[cacheKey]
  }

  const isAbs = isAbsolutePath(request)
  const fromPath = getModuleDirname(isAbs ? request : parent)

  const pkg = Package.get(fromPath)
  const pkgOptions = pkg && pkg.options

  let foundPath
  let extLookup = esmExtsLookup
  let searchExts = esmExts
  let skipWarnings = false

  if (! hasEncodedSlash(request)) {
    if (! isAbs &&
        ! isRelativePath(request) &&
        (request.charCodeAt(0) === 47 /* / */ ||
         request.indexOf(":") !== -1)) {
      const parsed = parseURL(request)
      foundPath = getFilePathFromURL(parsed)

      if (! foundPath &&
          parsed.protocol !== "file:" &&
          ! localhostRegExp.test(request)) {
        throw new errors.Error("ERR_INVALID_PROTOCOL", parsed.protocol, "file:")
      }

      if (foundPath) {
        foundPath = _resolveFilename(foundPath, parent, isMain, options, true, true, noExts)
      }
    } else {
      // Prevent resolving non-local dependencies:
      // https://github.com/bmeck/node-eps/blob/rewrite-esm/002-es-modules.md#432-removal-of-non-local-dependencies
      let skipGlobalPaths = true

      if (pkgOptions) {
        if (pkgOptions.gz) {
          extLookup = gzExtsLookup
          searchExts = gzExts
        }

        if (pkgOptions.cjs.paths) {
          skipGlobalPaths = false
        }
      }

      const decoded = decodeURIComponent(request.replace(queryHashRegExp, ""))
      foundPath = _resolveFilename(decoded, parent, isMain, options, skipWarnings, skipGlobalPaths, searchExts)
    }
  }

  if (foundPath) {
    if ((pkgOptions &&
        (pkgOptions.cjs.paths ||
         pkgOptions.esm === "js")) ||
        extname(foundPath) in extLookup) {
      return cache[cacheKey] = foundPath
    }

    throw new errors.Error("ERR_UNKNOWN_FILE_EXTENSION", foundPath)
  }

  skipWarnings = true
  foundPath = _resolveFilename(request, parent, isMain, options, skipWarnings)

  if (foundPath) {
    throw new errors.Error("ERR_MODULE_RESOLUTION_LEGACY", request, fromPath, foundPath)
  }

  throw new errors.Error("MODULE_NOT_FOUND", request)
}

export default resolveFilename
