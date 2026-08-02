package dev.amritk.minilynx.notifications

import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableArray
import com.lynx.react.bridge.ReadableMap
import com.lynx.react.bridge.ReadableType
import org.json.JSONArray
import org.json.JSONObject

/**
 * Conversions between Lynx's bridge containers and `org.json`.
 *
 * The middle format is JSON rather than the bridge's own types because a
 * scheduled notification has to survive process death: `AlarmManager` holds a
 * `PendingIntent`, the app gets killed, and what comes back has to rebuild the
 * notification from a string. `ReadableMap` has no serialised form, so
 * everything that persists goes through here.
 *
 * Numbers are the one lossy spot, and deliberately so: JavaScript has a single
 * number type, the bridge maps it to `double`, and a round trip through JSON
 * can hand back an `Integer` where a `Double` went in. Every reader here
 * therefore asks for the type it wants rather than trusting what it finds.
 */
internal object Json {
  fun toJson(map: ReadableMap?): JSONObject {
    val json = JSONObject()
    if (map == null) return json
    val keys = map.keySetIterator()
    while (keys.hasNextKey()) {
      val key = keys.nextKey()
      when (map.getType(key)) {
        ReadableType.Null -> json.put(key, JSONObject.NULL)
        ReadableType.Boolean -> json.put(key, map.getBoolean(key))
        ReadableType.Int -> json.put(key, map.getInt(key))
        ReadableType.Number -> json.put(key, map.getDouble(key))
        ReadableType.String -> json.put(key, map.getString(key))
        ReadableType.Map -> json.put(key, toJson(map.getMap(key)))
        ReadableType.Array -> json.put(key, toJson(map.getArray(key)))
        else -> json.put(key, JSONObject.NULL)
      }
    }
    return json
  }

  fun toJson(array: ReadableArray?): JSONArray {
    val json = JSONArray()
    if (array == null) return json
    for (index in 0 until array.size()) {
      when (array.getType(index)) {
        ReadableType.Null -> json.put(JSONObject.NULL)
        ReadableType.Boolean -> json.put(array.getBoolean(index))
        ReadableType.Int -> json.put(array.getInt(index))
        ReadableType.Number -> json.put(array.getDouble(index))
        ReadableType.String -> json.put(array.getString(index))
        ReadableType.Map -> json.put(toJson(array.getMap(index)))
        ReadableType.Array -> json.put(toJson(array.getArray(index)))
        else -> json.put(JSONObject.NULL)
      }
    }
    return json
  }

  fun toJavaOnlyMap(json: JSONObject?): JavaOnlyMap {
    val map = JavaOnlyMap()
    if (json == null) return map
    for (key in json.keys()) {
      when (val value = json.opt(key)) {
        null, JSONObject.NULL -> map.putNull(key)
        is Boolean -> map.putBoolean(key, value)
        is Int -> map.putInt(key, value)
        is Number -> map.putDouble(key, value.toDouble())
        is JSONObject -> map.putMap(key, toJavaOnlyMap(value))
        is JSONArray -> map.putArray(key, toJavaOnlyArray(value))
        else -> map.putString(key, value.toString())
      }
    }
    return map
  }

  fun toJavaOnlyArray(json: JSONArray?): JavaOnlyArray {
    val array = JavaOnlyArray()
    if (json == null) return array
    for (index in 0 until json.length()) {
      when (val value = json.opt(index)) {
        null, JSONObject.NULL -> array.pushNull()
        is Boolean -> array.pushBoolean(value)
        is Int -> array.pushInt(value)
        is Number -> array.pushDouble(value.toDouble())
        is JSONObject -> array.pushMap(toJavaOnlyMap(value))
        is JSONArray -> array.pushArray(toJavaOnlyArray(value))
        else -> array.pushString(value.toString())
      }
    }
    return array
  }
}
