import os,re
import IP2Location
import base64
import ipaddress
from nserver import NameServer, Response, A, AAAA, NS, TXT,Settings,SOA

base_domain=os.getenv("BASE_DOMAIN")
IP=os.getenv("IP")
base_domain="test.com"
IP="127.0.0.1"
print(base_domain,IP)
ns_settings=Settings()
ns_settings.server_address="0.0.0.0"
ns_settings.server_port = 153
ns = NameServer("passim",ns_settings)




def base32_to_ipv4(b32_str):
    """
    将使用 Base32（可能末尾用 '8' 替代 '=' 填充）的字符串解码为 IPv4 地址。
    使用内置 base64 库的 b32decode() 来解码，再用 ipaddress.IPv4Address 解析字节。
    :param b32_str: Base32 编码字符串（可能含 '8' 作填充）
    :return: IPv4 字符串 x.x.x.x
    :raises ValueError: 解码失败或长度不是 4 字节
    """
    # 1) 将末尾 '8' 替换回 '='
    s_stripped = b32_str.rstrip('8')  # 去掉尾部所有 '8'
    trailing_8_count = len(b32_str) - len(s_stripped)
    # 用同样数量的 '=' 填充
    b32_converted = s_stripped + ('=' * trailing_8_count)

    # 2) 解码 Base32
    try:
        raw_bytes = base64.b32decode(b32_converted)
    except base64.binascii.Error as e:
        raise ValueError(f"Base32 解码失败: {e}")

    # 3) IPv4 地址应精确 4 字节
    if len(raw_bytes) != 4:
        raise ValueError(f"解码后长度为 {len(raw_bytes)} 字节，不是 4 字节，无法还原为 IPv4。")

    # 4) 使用 ipaddress 解析
    return str(ipaddress.IPv4Address(raw_bytes))


def base32_to_ipv6(b32_str):
    """
    将使用 Base32（可能末尾用 '8' 替代 '=' 填充）的字符串解码为 IPv6 地址。
    使用内置 base64 库的 b32decode() 来解码，再用 ipaddress.IPv6Address 解析字节。
    :param b32_str: Base32 编码字符串（可能含 '8' 作填充）
    :return: IPv6 字符串 (如 2001:db8::1)
    :raises ValueError: 解码失败或长度不是 16 字节
    """
    # 1) 将末尾 '8' 替换回 '='
    s_stripped = b32_str.rstrip('8')
    trailing_8_count = len(b32_str) - len(s_stripped)
    b32_converted = s_stripped + ('=' * trailing_8_count)

    # 2) 解码 Base32
    try:
        raw_bytes = base64.b32decode(b32_converted)
    except base64.binascii.Error as e:
        raise ValueError(f"Base32 解码失败: {e}")

    # 3) IPv6 地址应精确 16 字节 (128 位)
    if len(raw_bytes) != 16:
        raise ValueError(f"解码后长度为 {len(raw_bytes)} 字节，不是 16 字节，无法还原为 IPv6。")

    # 4) 使用 ipaddress 解析
    return str(ipaddress.IPv6Address(raw_bytes))




@ns.rule("*."+base_domain, ["A"])
def base32_ipv4_reflex(query):
  perfix=query.name.lower().replace("."+base_domain,"")
  if(len(perfix)==8):
     return AAAA(query.name, base32_to_ipv4(perfix))
  if(len(perfix)==40):
     return AAAA(query.name, base32_to_ipv4(perfix[:8]))
  return Response()


@ns.rule("*."+base_domain, ["AAAA"])
def base32_ipv6_reflex(query):
  perfix=query.name.lower().replace("."+base_domain,"")
  if(len(perfix)==32):
     return AAAA(query.name, base32_to_ipv6(perfix))
  if(len(perfix)==40):
     return AAAA(query.name, base32_to_ipv6(perfix[8:]))
  return Response()
     

@ns.rule("**."+base_domain, ["A"])
def ipv4_reflex(query):
  try:
    ipaddress.IPv4Address(query.name.lower().replace("."+base_domain,""))
    return A(query.name, query.name.lower().replace("."+base_domain,""))
  except ipaddress.AddressValueError:
    return Response()

@ns.rule("**."+base_domain, ["AAAA"])
def ipv6_reflex(query):
  try:
    ipaddress.IPv6Address(query.name.lower().replace("."+base_domain,"").replace("x",":"))
    return AAAA(query.name, query.name.lower().replace("."+base_domain,"").replace("x",":"))
  except ipaddress.AddressValueError:
    return Response()


@ns.rule("**."+base_domain, ["TXT"])
def ip2loc(query):
  IPdb=IP2Location.IP2Location("/code/app/ip2loc/IP2LOCATION-LITE-DB1.BIN")
  try:
    ipaddress.IPv4Address(query.name.lower().replace("."+base_domain,""))
    return TXT(query.name, IPdb.get_country_short(query.name.lower().replace("."+base_domain,"")))
  except ipaddress.AddressValueError:
    return Response()



@ns.rule("ns."+base_domain, ["A"])
def local_loopback_nx(query):
  return A(query.name, IP)

@ns.rule("**."+base_domain, ["SOA","AAAA","MX"])
def local_loopback_SOA(query):
  return SOA(query.name,
  "ns."+base_domain+".",
  "root."+base_domain+".",
  1,600,85400,2419200,604800)

@ns.rule("**."+base_domain, ["A"])
def local_loopback_A(query):
  return A(query.name, IP)

@ns.rule("**."+base_domain, ["NS"])
def local_loopback_NS(query):
  return NS(query.name, "ns."+base_domain+".")



if __name__ == "__main__":

    ns.run()