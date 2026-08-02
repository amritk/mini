package dev.amritk.minilynx.location

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
 * `timeout` of `15000` and one of `15000.5` are the same option.
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
          else -> null
        }
    }
    return options
  }

  fun string(options: Map<String, Any?>, key: String, fallback: String): String =
    options[key] as? String ?: fallback

  fun boolean(options: Map<String, Any?>, key: String, fallback: Boolean): Boolean =
    options[key] as? Boolean ?: fallback

  fun long(options: Map<String, Any?>, key: String, fallback: Long): Long =
    (options[key] as? Number)?.toLong() ?: fallback

  fun float(options: Map<String, Any?>, key: String, fallback: Float): Float =
    (options[key] as? Number)?.toFloat() ?: fallback
}
