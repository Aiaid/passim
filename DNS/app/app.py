from pymongo import MongoClient
import os,re
from datetime import datetime
from datetime import timezone
from nserver import NameServer, Response, A, NS, TXT,Settings

MONGOURL = os.getenv("MONGOURL")
base_domain=os.getenv("BASE_DOMAIN")
MONGOURL = "***REDACTED***"
base_domain=".passim.cloud"
print(MONGOURL,base_domain)
dbclient=MongoClient(MONGOURL)
ns_settings=Settings()
ns_settings.server_address="0.0.0.0"
ns_settings.server_port = 53
ns = NameServer("passim",ns_settings)



ipv4 = re.compile("(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)")


@ns.rule("**.ip"+base_domain, ["A"])
def ip_reflex(query):
  if(ipv4.fullmatch(query.name.replace(".ip"+base_domain,""))!=None):
    return A(query.name, query.name.replace(".ip"+base_domain,""))
  return Response()

@ns.rule("**"+base_domain, ["A"])
def DDNS(query):
  name=query.name.replace(base_domain,"")
  db=dbclient["resource"]
  data=db["vps"].find_one({"name":name},projection={"name":True,"ip":True})
  if(data==None):
    return Response()
  if(ipv4.fullmatch(data.get('ip',""))!=None):
    return A(query.name, data["ip"])
  return Response()





if __name__ == "__main__":

    ns.run()