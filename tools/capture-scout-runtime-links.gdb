set pagination off
set confirm off
set breakpoint pending on
set print address on
set logging file scout-runtime-link-capture.txt
set logging overwrite on
set logging enabled on

set $reg_hits = 0
set $request_hits = 0
set $finalize_hits = 0
set $loader_hits = 0
set $setter_hits = 0
set $consumer_hits = 0
set $walk_hits = 0

# Runtime object registration: EAX is the registered object pointer.
break *0x422400
commands
  silent
  set $reg_hits = $reg_hits + 1
  if $reg_hits <= 64
    printf "\n=== REGISTER #%u caller=%#x object=%#x key=%#x ===\n", $reg_hits, *(unsigned int*)$esp, $eax, *(unsigned short*)($eax+2)
    x/64wx $eax
  end
  continue
end

# Dynamic request creator: EAX is the request key; EDX points at the input vector.
break *0x42244d
commands
  silent
  set $request_hits = $request_hits + 1
  if $request_hits <= 64
    printf "\n=== REQUEST_CREATE #%u caller=%#x key=%#x edx=%#x ebx=%#x ===\n", $request_hits, *(unsigned int*)$esp, $eax, $edx, $ebx
    printf "registry_count=%u request_count=%u\n", *(unsigned int*)0x647534, *(unsigned int*)0x6476f8
    x/16wx $edx
    x/32wx $ebx
  end
  continue
end

# End of finalizer, after request keys have been matched to registered objects.
break *0x4225e6
commands
  silent
  set $finalize_hits = $finalize_hits + 1
  if $finalize_hits <= 32
    printf "\n=== FINALIZE_DONE #%u caller=%#x registry_count=%u request_count=%u ===\n", $finalize_hits, *(unsigned int*)$esp, *(unsigned int*)0x647534, *(unsigned int*)0x6476f8
    set $i = 0
    set $n = *(unsigned int*)0x647534
    while $i < $n && $i < 32
      set $p = *(unsigned int*)(0x647538 + $i*4)
      printf "REG[%u] ptr=%#x key=%#x\n", $i, $p, *(unsigned short*)($p+2)
      x/32wx $p
      set $i = $i + 1
    end
    set $i = 0
    set $n = *(unsigned int*)0x6476f8
    while $i < $n && $i < 32
      set $row = 0x647578 + $i*12
      set $key = *(unsigned int*)$row
      set $obj = *(unsigned int*)($row+8)
      printf "REQ[%u] key=%#x request_object=%#x", $i, $key, $obj
      if $obj != 0
        set $link = *(unsigned int*)($obj+0x160)
        printf " linked_object=%#x\n", $link
        x/64wx $obj
        if $link != 0
          x/32wx $link
        end
      else
        printf "\n"
      end
      set $i = $i + 1
    end
  end
  continue
end

# Structure-load finalizer call path.
break *0x435668
commands
  silent
  set $loader_hits = $loader_hits + 1
  if $loader_hits <= 32
    printf "\n=== LOADER_FINALIZE #%u caller=%#x ===\n", $loader_hits, *(unsigned int*)$esp
    info registers eax ebx ecx edx esi edi ebp esp
    x/24wx $esp
  end
  continue
end

# Setter for the object consumed by the transform walker.
break *0x4e3260
commands
  silent
  set $setter_hits = $setter_hits + 1
  if $setter_hits <= 64
    printf "\n=== TRANSFORM_SETTER #%u caller=%#x object=%#x ===\n", $setter_hits, *(unsigned int*)$esp, $eax
    x/64wx $eax
  end
  continue
end

# Transform consumer entry. The current object is global 0x12d7368; +0x160 is the keyed link.
break *0x4e32a2
commands
  silent
  set $consumer_hits = $consumer_hits + 1
  if $consumer_hits <= 64
    set $obj = *(unsigned int*)0x12d7368
    printf "\n=== TRANSFORM_CONSUMER #%u caller=%#x current_object=%#x ===\n", $consumer_hits, *(unsigned int*)$esp, $obj
    if $obj != 0
      set $link = *(unsigned int*)($obj+0x160)
      printf "linked_object_160=%#x\n", $link
      x/64wx $obj
      if $link != 0
        x/64wx $link
      end
    end
  end
  continue
end

# Main transform walk, after the consumer has built its 28-byte runtime rows.
break *0x4e3fad
commands
  silent
  set $walk_hits = $walk_hits + 1
  if $walk_hits <= 64
    set $count = *(int*)0x12d736c
    printf "\n=== TRANSFORM_WALK #%u caller=%#x count=%d ===\n", $walk_hits, *(unsigned int*)$esp, $count
    set $i = 0
    while $i < $count && $i < 64
      set $row = 0x52d28c + $i*28
      set $ptr = *(unsigned int*)$row
      printf "ROW[%u] ptr=%#x vector=(%#x,%#x,%#x) matrix_id=%#x\n", $i, $ptr, *(unsigned int*)($row+4), *(unsigned int*)($row+8), *(unsigned int*)($row+12), *(unsigned int*)($row+24)
      x/7wx $row
      if $ptr != 0
        x/64wx $ptr
      end
      set $i = $i + 1
    end
  end
  continue
end

printf "Scout runtime capture installed. Use the male Scout in-game for 15-30 seconds.\n"
printf "Then press Ctrl-C, type 'detach', then 'quit'. Log: scout-runtime-link-capture.txt\n"
continue
