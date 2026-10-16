import { Link } from 'react-router'

function NotFoundPage() {
  return (
    <>
      <h1>Không tìm thấy trang</h1>
      <p>
        <Link to="/">Về danh sách các nhà</Link>
      </p>
    </>
  )
}

export default NotFoundPage
