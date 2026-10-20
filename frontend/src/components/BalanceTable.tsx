import type { MemberBalance } from '../api/types'
import { formatVND } from '../lib/money'

interface BalanceTableProps {
  /** One row per member, already ordered by member id. */
  balances: MemberBalance[]
  loading?: boolean
  error?: string | null
}

/** Props-only table. The net sign decides the class and the words, the debt shows as an absolute value. */
function BalanceTable({ balances, loading = false, error = null }: BalanceTableProps) {
  if (loading) {
    return <p>Đang tải số dư…</p>
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {/* An empty table after an error means "could not load", not "nobody owes anything" */}
      {balances.length === 0 ? (
        !error && <p>Chưa có dữ liệu số dư.</p>
      ) : (
        <table className="balance-table">
          <caption>Số dư của mọi người</caption>
          <thead>
            <tr>
              <th scope="col">Thành viên</th>
              <th scope="col">Đã trả</th>
              <th scope="col">Phải trả</th>
              <th scope="col">Còn lại</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((balance) => {
              const state = balance.net > 0 ? 'positive' : balance.net < 0 ? 'negative' : 'zero'
              const wording =
                balance.net > 0 ? 'được nhận' : balance.net < 0 ? 'còn nợ' : 'đã xong'
              return (
                <tr key={balance.member_id} className={state}>
                  <th scope="row">{balance.name}</th>
                  <td>{formatVND(balance.paid)}</td>
                  <td>{formatVND(balance.owed)}</td>
                  <td className="net">
                    {formatVND(Math.abs(balance.net))}{' '}
                    <span className="state">{wording}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default BalanceTable
