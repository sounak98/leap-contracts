/* eslint-disable import/no-extraneous-dependencies */
require('babel-register')
require('babel-polyfill')

require('dotenv').config();

const HDWalletProvider = require('truffle-hdwallet-provider');

module.exports = {
  // Configure your compilers
  compilers: {
    solc: {
      version: '0.5.2',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
        // TODO: the code is supposed to work on constantinople EVM but fails if this is switched on
        evmVersion: 'byzantium',
      },
    },
  },
  // See <http://truffleframework.com/docs/advanced/configuration>
  // to customize your Truffle configuration!
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      network_id: '*' // match any network
    },
    mainnet: {
      provider: () => new HDWalletProvider(
        process.env.MAINNET_MNEMONIC, 'https://mainnet.infura.io', 0, 2,
      ),
      network_id: '1',
      gas: 200000,
      gasPrice: 5000000000 // Specified in Wei
    },
    rinkeby: {
      provider: () => new HDWalletProvider(
        process.env.RINKEBY_MNEMONIC, 'https://rinkeby.infura.io', 0, 2,
      ),
      network_id: '4',
      gas: 200000
    },
    ganache: {
      host: 'localhost',
      port: 7545,
      network_id: 5777
    },
    coverage: {
      host: 'localhost',
      port: 8555,
      network_id: '*', // eslint-disable-line camelcase
      gas: 0xfffffffffffff,
      gasPrice: 0x01,
    },
  }
}
