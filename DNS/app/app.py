from pymongo import MongoClient
import os,re
import urllib.request
import IP2Location
from datetime import datetime
from datetime import timezone
from nserver import NameServer, Response, A, NS, TXT,Settings,SOA

MONGOURL = os.getenv("MONGOURL")
base_domain=os.getenv("BASE_DOMAIN")
IP_domain=os.getenv("IP_DOMAIN")
IP=os.getenv("IP")
print(MONGOURL,base_domain,IP_domain,IP)
dbclient=MongoClient(MONGOURL)
ns_settings=Settings()
ns_settings.server_address="0.0.0.0"
ns_settings.server_port = 53
ns = NameServer("passim",ns_settings)



ipv4 = re.compile("(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)")








@ns.rule("**."+IP_domain, ["A"])
def ip_reflex(query):
  if(ipv4.fullmatch(query.name.lower().replace("."+IP_domain,""))!=None):
    return A(query.name, query.name.lower().replace("."+IP_domain,""))
  return Response()

@ns.rule("**."+IP_domain, ["TXT"])
def ip2loc(query):
  IPdb=IP2Location.IP2Location("/code/app/ip2loc/IP2LOCATION-LITE-DB1.BIN")
  if(ipv4.fullmatch(query.name.lower().replace("."+IP_domain,""))!=None):
    return TXT(query.name, IPdb.get_country_short(query.name.lower().replace("."+IP_domain,"")))
  return Response()

@ns.rule("**."+base_domain, ["A"])
def DDNS(query):
  name=query.name.lower().replace("."+base_domain,"")
  db=dbclient["resource"]
  data=db["vps"].find_one({"name":name},projection={"name":True,"ip":True})
  if(data==None):
    return Response()
  if(ipv4.fullmatch(data.get('ip',""))!=None):
    return A(query.name, data["ip"])
  return Response()


@ns.rule("ns."+base_domain, ["A"])
def local_loopback_nx(query):
  return A(query.name, IP)

@ns.rule(IP_domain, ["A"])
def local_loopback_IP(query):
  return A(query.name, IP)

@ns.rule("ns."+IP_domain, ["A"])
def IP_local_loopback_nx(query):
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

@ns.rule("**."+IP_domain, ["SOA","AAAA","MX"])
def IP_local_loopback_SOA(query):
  return SOA(query.name,
  "ns."+IP_domain+".",
  "root."+IP_domain+".",
  1,600,85400,2419200,604800)

@ns.rule("**."+IP_domain, ["A"])
def IP_local_loopback_A(query):
  return A(query.name, IP)

@ns.rule("**."+IP_domain, ["NS"])
def IP_local_loopback_NS(query):
  return NS(query.name, "ns."+IP_domain+".")

if __name__ == "__main__":

    ns.run()