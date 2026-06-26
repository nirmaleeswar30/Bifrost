import socket
import struct
import time
import subprocess

proc = subprocess.Popen(["adb", "shell", "CLASSPATH=/data/local/tmp/scrcpy-server.jar app_process / com.genymobile.scrcpy.Server 2.4 tunnel_forward=true audio=false control=false max_size=1080 max_fps=60"])
time.sleep(2)
subprocess.run(["adb", "forward", "tcp:27183", "localabstract:scrcpy"])

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(("127.0.0.1", 27183))

try:
    _ = s.recv(65)
    _ = s.recv(12)
    
    header = s.recv(12)
    pts, size = struct.unpack(">QI", header)
    packet = s.recv(size)
    print("Packet 0 payload starts with:", packet[:16])

    header = s.recv(12)
    pts, size = struct.unpack(">QI", header)
    packet = s.recv(size)
    print("Packet 1 payload starts with:", packet[:16])
except Exception as e:
    print("Exception:", e)
finally:
    proc.terminate()
