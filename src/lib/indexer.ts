import { ContractRepositoryImpl, RestIndexerProvider } from '@arkade-os/sdk'
import { AspInfo } from '../providers/asp'
import { IndexedDBStorageAdapter } from '@arkade-os/sdk/adapters/indexedDB'

interface CommitmentTxRecord {
  txid: string
  when: number // milliseconds since epoch
}

export class Indexer {
  contractRepo: ContractRepositoryImpl
  readonly provider: RestIndexerProvider
  readonly contractCollection = 'commitmentTxs'

  constructor(aspInfo: AspInfo) {
    this.provider = new RestIndexerProvider(aspInfo.url)
    // Dedicated DB: the v0.4 IndexedDBWalletRepository / IndexedDBContractRepository
    // own 'arkade-service-worker' with a different object-store schema, so calls
    // to the legacy getContractCollection here would throw "object stores not found".
    const storage = new IndexedDBStorageAdapter('arkade-indexer-cache')
    this.contractRepo = new ContractRepositoryImpl(storage)
  }

  getCommitmentTxCreatedAt = async (txid: string): Promise<number | null> => {
    const records = (await this.contractRepo.getContractCollection(this.contractCollection)) as CommitmentTxRecord[]
    const tx = records.find((r) => r.txid === txid)
    if (tx) return tx.when

    const commitmentTx = await this.provider.getCommitmentTx(txid)
    if (!commitmentTx?.endedAt) return null
    const when = Number(commitmentTx.endedAt)

    await this.contractRepo.saveToContractCollection(
      this.contractCollection,
      { txid, when },
      'txid', // key field
    )

    return when
  }
}
