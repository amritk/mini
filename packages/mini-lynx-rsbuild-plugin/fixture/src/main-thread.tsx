import { renderPage, signal } from '@amritk/mini-lynx'
import './app.css'

const Counter = () => {
  const count = signal(0)
  return (
    <view class="card" bindtap={() => count(count() + 1)}>
      <text class="title">mini-lynx</text>
      <text class="count">{() => `tapped ${count()} times`}</text>
    </view>
  )
}

renderPage(Counter)
