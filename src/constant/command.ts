enum ECOMMAND {
  NETWORK_TYPE_LIST = 'networksetup -listallnetworkservices',
  GET_NERWORK_INFO = 'networksetup -getinfo "{type}"',
  GET_PROXY_STATE = 'networksetup -getwebproxy "{type}"'
}
