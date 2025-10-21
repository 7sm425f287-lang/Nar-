import time

def sleep_for(seconds: float) -> None:
    time.sleep(seconds)

if __name__ == "__main__":
    import sys
    seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
    sleep_for(seconds)
