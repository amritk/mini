package dev.amritk.minilynx.dialogs

import com.lynx.react.bridge.ReadableArray
import com.lynx.react.bridge.ReadableMap
import com.lynx.react.bridge.ReadableType

/**
 * Reading an options bag that came across the bridge, without trusting it.
 *
 * `ReadableMap.getDouble` and friends throw on a key that is not there, and
 * `getType` throws on one too — so every read has to be preceded by knowing the
 * key exists. Walking `keySetIterator` once into a plain Kotlin map is the
 * cheapest way to make that true for all of them at once, and it means a
 * missing option can only ever produce its default.
 *
 * Numbers arrive as whichever of `Int` and `Number` the engine decided on for
 * that particular value, which is not stable across call sites — JavaScript has
 * one number type and the bridge picks a Java one. Both are read here, so a
 * `minuteInterval` of `15` and one of `15.0` are the same option.
 *
 * This is `@amritk/lynx-location`'s reader plus the two container cases, which
 * that package had no use for: an action sheet's `actions` is an array of maps,
 * and it is the only nested structure this package receives.
 */
internal object Options {
  fun read(map: ReadableMap?): Map<String, Any?> {
    val options = mutableMapOf<String, Any?>()
    if (map == null) return options
    val keys = map.keySetIterator()
    while (keys.hasNextKey()) {
      val key = keys.nextKey()
      options[key] =
        when (map.getType(key)) {
          ReadableType.Boolean -> map.getBoolean(key)
          ReadableType.Int -> map.getInt(key)
          ReadableType.Number -> map.getDouble(key)
          ReadableType.String -> map.getString(key)
          ReadableType.Map -> read(map.getMap(key))
          ReadableType.Array -> readArray(map.getArray(key))
          else -> null
        }
    }
    return options
  }

  fun readArray(array: ReadableArray?): List<Any?> {
    val values = mutableListOf<Any?>()
    if (array == null) return values
    for (index in 0 until array.size()) {
      values +=
        when (array.getType(index)) {
          ReadableType.Boolean -> array.getBoolean(index)
          ReadableType.Int -> array.getInt(index)
          ReadableType.Number -> array.getDouble(index)
          ReadableType.String -> array.getString(index)
          ReadableType.Map -> read(array.getMap(index))
          ReadableType.Array -> readArray(array.getArray(index))
          else -> null
        }
    }
    return values
  }

  fun string(options: Map<String, Any?>, key: String, fallback: String): String =
    options[key] as? String ?: fallback

  /** For the optional labels, where "not set" has to stay distinguishable from "empty". */
  fun stringOrNull(options: Map<String, Any?>, key: String): String? = options[key] as? String

  fun boolean(options: Map<String, Any?>, key: String, fallback: Boolean): Boolean =
    options[key] as? Boolean ?: fallback

  /** Null rather than a default, for the options whose absence means "follow the device". */
  fun booleanOrNull(options: Map<String, Any?>, key: String): Boolean? = options[key] as? Boolean

  fun long(options: Map<String, Any?>, key: String, fallback: Long): Long =
    (options[key] as? Number)?.toLong() ?: fallback

  fun longOrNull(options: Map<String, Any?>, key: String): Long? = (options[key] as? Number)?.toLong()

  fun int(options: Map<String, Any?>, key: String, fallback: Int): Int = (options[key] as? Number)?.toInt() ?: fallback

  /**
   * The list of maps behind `actions`.
   *
   * Entries that did not arrive as maps are kept as empty ones rather than
   * dropped, because an action sheet's indices are its contract: `index` in the
   * result is a position in the array JavaScript passed, and silently removing
   * a malformed entry would shift every row after it onto the wrong action.
   */
  fun maps(options: Map<String, Any?>, key: String): List<Map<String, Any?>> {
    val list = options[key] as? List<*> ?: return emptyList()
    return list.map { entry ->
      val map = entry as? Map<*, *> ?: return@map emptyMap()
      map.entries.associate { (name, value) -> name.toString() to value }
    }
  }
}
